"""Teacher-facing RAG chat over one student's learning record."""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

import access
import models
from agents.coordinator import MeshCoordinator, MeshCoordinatorBusyError
from agents.runtime import CoreMentorRuntime
from agents.schemas import (
    StudentInsightChatRequest,
    StudentInsightChatResponse,
    StudentInsightSource,
)


CHAT_AGENT_NAME = "teacher_insight_chat"


class StudentInsightChatService:
    """Sidecar chat service that keeps teacher insight Q&A out of the graph path."""

    def __init__(self, db: Session, runtime: Optional[CoreMentorRuntime] = None):
        self.db = db
        self.runtime = runtime or CoreMentorRuntime()

    def answer(
        self,
        request: StudentInsightChatRequest,
        actor: Dict[str, Any],
    ) -> StudentInsightChatResponse:
        student = access.assert_can_access_student(self.db, actor, request.student_id)
        postgres_context, postgres_sources = self._build_postgres_context(student, actor)

        acquired = MeshCoordinator.acquire_inference_slot()
        if not acquired:
            raise MeshCoordinatorBusyError(
                "Another CoreMentor agent workflow or insight chat is already running. Try again shortly."
            )

        try:
            chroma_memories = self._search_student_memory(str(student.id), request.question)
            sources = postgres_sources + self._memory_sources(chroma_memories)
            fallback = self._fallback_response(
                request=request,
                context=postgres_context,
                sources=sources,
                chroma_memories=chroma_memories,
            )
            llm_payload = self.runtime.invoke_json(
                messages=[
                    (
                        "system",
                        (
                            "You are CoreMentor's teacher insight chat. Answer the teacher's question "
                            "using only the supplied PostgreSQL context and Chroma student memories. "
                            "Do not mention or infer unrelated students. If evidence is missing, say so. "
                            "Return JSON with keys: answer, confidence, recommended_next_steps, "
                            "source_ids_used, limitations."
                        ),
                    ),
                    (
                        "user",
                        json.dumps(
                            {
                                "teacher_question": request.question,
                                "conversation": [
                                    _model_to_dict(turn) for turn in request.conversation[-6:]
                                ],
                                "postgres_context": postgres_context,
                                "chroma_student_memories": chroma_memories,
                                "available_source_ids": [source.id for source in sources],
                            },
                            indent=2,
                            default=_json_default,
                        ),
                    ),
                ],
                fallback=fallback,
            )
        finally:
            MeshCoordinator.release_inference_slot()

        response = self._normalize_response(
            student_id=str(student.id),
            payload=llm_payload,
            fallback=fallback,
            sources=sources,
            chroma_memories=chroma_memories,
        )
        self._record_chat_interaction(student_id=str(student.id), request=request, response=response, actor=actor)
        return response

    def _build_postgres_context(
        self,
        student: models.StudentProfile,
        actor: Dict[str, Any],
    ) -> tuple[Dict[str, Any], List[StudentInsightSource]]:
        user = self.db.query(models.User).filter(models.User.id == student.user_id).first()
        units = self._student_units(student, actor)
        unit_ids = [unit.id for unit in units]

        marks = self._recent_marks(student, unit_ids, actor)
        skills = self._skill_progress(student, unit_ids, actor)
        plan = (
            self.db.query(models.DailyHomeworkPlan)
            .filter(models.DailyHomeworkPlan.student_id == student.id)
            .order_by(models.DailyHomeworkPlan.planned_for_date.desc())
            .first()
        )
        runs = (
            self.db.query(models.AgentRun)
            .filter(models.AgentRun.student_id == student.id)
            .order_by(models.AgentRun.started_at.desc())
            .limit(6)
            .all()
        )
        interactions = (
            self.db.query(models.AgentInteraction)
            .filter(models.AgentInteraction.student_id == student.id)
            .order_by(models.AgentInteraction.timestamp.desc())
            .limit(6)
            .all()
        )

        average_score = _average([item["score"] for item in marks if item.get("score") is not None])
        lowest_marks = sorted(
            [item for item in marks if item.get("score") is not None],
            key=lambda item: item["score"],
        )[:3]

        context = {
            "student": {
                "id": str(student.id),
                "full_name": user.full_name if user else "Unknown student",
                "career_goal": student.career_goal,
                "level": student.level,
                "total_xp": student.total_xp,
                "rank_title": student.rank_title,
                "root_cause_analysis": student.root_cause_analysis,
                "mentor_notes": student.teacher_notes,
            },
            "teacher_scope": {
                "actor_role": actor.get("role"),
                "visible_unit_count": len(units),
                "visible_unit_ids": [str(unit.id) for unit in units],
            },
            "units": [
                {
                    "id": str(unit.id),
                    "name": unit.unit_name,
                    "description": unit.description,
                }
                for unit in units
            ],
            "recent_marks": marks,
            "lowest_recent_marks": lowest_marks,
            "average_recent_score": average_score,
            "skill_progress": skills,
            "latest_homework_plan": self._plan_to_dict(plan),
            "recent_agent_runs": [
                {
                    "workflow": run.workflow,
                    "selected_agents": run.selected_agents or [],
                    "status": run.status,
                    "started_at": _iso(run.started_at),
                    "finished_at": _iso(run.finished_at),
                }
                for run in runs
            ],
            "recent_agent_interactions": [
                {
                    "agent_name": item.agent_name,
                    "message_payload": item.message_payload,
                    "timestamp": _iso(item.timestamp),
                }
                for item in interactions
            ],
        }

        sources = [
            StudentInsightSource(
                id="postgres:student_profile",
                kind="postgres",
                title="Student profile",
                summary=(
                    f"{context['student']['full_name']} | career goal: "
                    f"{context['student']['career_goal'] or 'not set'} | "
                    f"rank: {context['student']['rank_title']}"
                ),
            ),
            StudentInsightSource(
                id="postgres:teacher_visible_units",
                kind="postgres",
                title="Teacher-visible units",
                summary=", ".join(unit.unit_name for unit in units) or "No visible units.",
            ),
            StudentInsightSource(
                id="postgres:recent_marks",
                kind="postgres",
                title="Recent marks",
                summary=(
                    f"{len(marks)} recent marked submissions; "
                    f"average score {average_score if average_score is not None else 'N/A'}."
                ),
            ),
            StudentInsightSource(
                id="postgres:skill_progress",
                kind="postgres",
                title="Skill progress",
                summary=f"{len(skills)} visible skill-progress records.",
            ),
            StudentInsightSource(
                id="postgres:latest_homework_plan",
                kind="postgres",
                title="Latest homework plan",
                summary="Available." if plan else "No daily homework plan generated yet.",
            ),
            StudentInsightSource(
                id="postgres:agent_audit",
                kind="postgres",
                title="Recent agent audit",
                summary=f"{len(runs)} recent agent runs and {len(interactions)} recent interaction logs.",
            ),
        ]
        return context, sources

    def _student_units(self, student: models.StudentProfile, actor: Dict[str, Any]) -> List[models.Unit]:
        query = (
            self.db.query(models.Unit)
            .join(models.Enrollment, models.Enrollment.unit_id == models.Unit.id)
            .filter(models.Enrollment.student_id == student.id)
        )
        if actor.get("role") == "Teacher":
            query = query.filter(models.Unit.teacher_id == _uuid(actor.get("sub")))
        return query.order_by(models.Unit.unit_name.asc()).all()

    def _recent_marks(
        self,
        student: models.StudentProfile,
        unit_ids: List[uuid.UUID],
        actor: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        query = (
            self.db.query(models.AIMarkingDraft, models.Submission, models.Assignment, models.Unit)
            .join(models.Submission, models.Submission.id == models.AIMarkingDraft.submission_id)
            .join(models.Assignment, models.Assignment.id == models.Submission.assignment_id)
            .join(models.Unit, models.Unit.id == models.Assignment.unit_id)
            .filter(models.Submission.student_id == student.id)
        )
        if actor.get("role") == "Teacher":
            if not unit_ids:
                return []
            query = query.filter(models.Assignment.unit_id.in_(unit_ids))

        rows = query.order_by(models.Submission.uploaded_at.desc()).limit(12).all()
        return [
            {
                "assignment_title": assignment.title,
                "unit_name": unit.unit_name,
                "score": mark.initial_score,
                "status": mark.status,
                "confidence_score": mark.confidence_score,
                "feedback_text": mark.feedback_text,
                "agent_log": mark.agent_log,
                "uploaded_at": _iso(submission.uploaded_at),
            }
            for mark, submission, assignment, unit in rows
        ]

    def _skill_progress(
        self,
        student: models.StudentProfile,
        unit_ids: List[uuid.UUID],
        actor: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        query = (
            self.db.query(models.StudentSkillProgress, models.SkillNode, models.Unit)
            .join(models.SkillNode, models.SkillNode.id == models.StudentSkillProgress.node_id)
            .join(models.Unit, models.Unit.id == models.SkillNode.unit_id)
            .filter(models.StudentSkillProgress.student_id == student.id)
        )
        if actor.get("role") == "Teacher":
            if not unit_ids:
                return []
            query = query.filter(models.SkillNode.unit_id.in_(unit_ids))

        rows = query.order_by(models.Unit.unit_name.asc(), models.SkillNode.node_name.asc()).all()
        return [
            {
                "unit_name": unit.unit_name,
                "node_name": node.node_name,
                "status": progress.status,
                "current_xp": progress.current_xp,
                "xp_to_unlock": node.xp_to_unlock,
            }
            for progress, node, unit in rows
        ]

    def _search_student_memory(self, student_id: str, question: str) -> List[str]:
        memory = self.runtime.memory
        if memory is None:
            return []
        try:
            return memory.search_student_patterns(student_id=student_id, query=question, k=5)
        except Exception:
            return []

    def _fallback_response(
        self,
        request: StudentInsightChatRequest,
        context: Dict[str, Any],
        sources: List[StudentInsightSource],
        chroma_memories: List[str],
    ) -> Dict[str, Any]:
        student = context["student"]
        marks = context["recent_marks"]
        skills = context["skill_progress"]
        average_score = context["average_recent_score"]
        root_cause = student.get("root_cause_analysis")
        mentor_notes = student.get("mentor_notes")

        answer_parts = [
            f"For {student['full_name']}, the current visible record shows "
            f"{len(marks)} recent marked submissions and {len(skills)} skill-progress records."
        ]
        if average_score is not None:
            answer_parts.append(f"The recent average score is {average_score}.")
        if root_cause:
            answer_parts.append(f"Shadow Mentor diagnosis: {root_cause}")
        if mentor_notes:
            answer_parts.append(f"Teacher notes: {mentor_notes}")
        if chroma_memories:
            answer_parts.append("Chroma memory adds: " + "; ".join(chroma_memories[:3]))
        if not marks and not skills and not chroma_memories:
            answer_parts.append("There is not enough evidence yet for a confident diagnosis.")

        return {
            "answer": " ".join(answer_parts),
            "confidence": "medium" if marks or skills or chroma_memories else "low",
            "recommended_next_steps": self._default_next_steps(context),
            "source_ids_used": [source.id for source in sources[:6]],
            "limitations": [
                "This answer is limited to records the current teacher/admin is allowed to see.",
                "Use teacher judgment before changing marks, workload, or interventions.",
            ],
        }

    def _normalize_response(
        self,
        student_id: str,
        payload: Dict[str, Any],
        fallback: Dict[str, Any],
        sources: List[StudentInsightSource],
        chroma_memories: List[str],
    ) -> StudentInsightChatResponse:
        source_ids = {source.id for source in sources}
        confidence = str(payload.get("confidence") or fallback["confidence"]).lower()
        if confidence not in {"low", "medium", "high"}:
            confidence = fallback["confidence"]

        used = [
            item
            for item in _string_list(payload.get("source_ids_used"), fallback["source_ids_used"])
            if item in source_ids
        ]
        if not used:
            used = fallback["source_ids_used"]

        return StudentInsightChatResponse(
            student_id=student_id,
            answer=str(payload.get("answer") or fallback["answer"]),
            confidence=confidence,  # type: ignore[arg-type]
            recommended_next_steps=_string_list(
                payload.get("recommended_next_steps"),
                fallback["recommended_next_steps"],
            )[:6],
            source_ids_used=used[:8],
            sources=sources,
            limitations=_string_list(payload.get("limitations"), fallback["limitations"])[:6],
            retrieval={
                "postgres_source_count": len([source for source in sources if source.kind == "postgres"]),
                "chroma_memory_count": len(chroma_memories),
                "chroma_student_filter": student_id,
            },
        )

    def _record_chat_interaction(
        self,
        student_id: str,
        request: StudentInsightChatRequest,
        response: StudentInsightChatResponse,
        actor: Dict[str, Any],
    ) -> None:
        self.db.add(
            models.AgentInteraction(
                student_id=_uuid(student_id),
                agent_name=CHAT_AGENT_NAME,
                message_payload={
                    "actor_user_id": actor.get("sub"),
                    "actor_role": actor.get("role"),
                    "question": request.question,
                    "answer": response.answer,
                    "confidence": response.confidence,
                    "source_ids_used": response.source_ids_used,
                    "retrieval": response.retrieval,
                },
            )
        )
        self.db.commit()

    @staticmethod
    def _plan_to_dict(plan: Optional[models.DailyHomeworkPlan]) -> Optional[Dict[str, Any]]:
        if not plan:
            return None
        return {
            "homework_recipe": plan.homework_recipe,
            "is_completed": plan.is_completed,
            "planned_for_date": _iso(plan.planned_for_date),
        }

    @staticmethod
    def _memory_sources(memories: List[str]) -> List[StudentInsightSource]:
        return [
            StudentInsightSource(
                id=f"chroma:student_patterns:{index}",
                kind="chroma",
                title=f"Student pattern memory {index}",
                summary=text[:500],
            )
            for index, text in enumerate(memories, start=1)
        ]

    @staticmethod
    def _default_next_steps(context: Dict[str, Any]) -> List[str]:
        steps = [
            "Review the lowest recent marks and compare them with current skill-progress status.",
            "Use the next assignment feedback to test whether the same mistake pattern repeats.",
        ]
        if not context["student"].get("root_cause_analysis"):
            steps.append("Run the Student Support or Grade Submission workflow to refresh Shadow Mentor analysis.")
        if not context.get("latest_homework_plan"):
            steps.append("Run Daily Plan if the student needs a concrete workload recommendation.")
        return steps


def _string_list(value: Any, fallback: List[str]) -> List[str]:
    if isinstance(value, list):
        cleaned = [str(item) for item in value if item not in (None, "")]
        return cleaned or fallback
    return fallback


def _average(values: List[float]) -> Optional[float]:
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def _uuid(value: Any) -> uuid.UUID:
    return uuid.UUID(str(value))


def _iso(value: Any) -> Optional[str]:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return None


def _json_default(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return str(value)


def _model_to_dict(value: Any) -> Dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return value.dict()
