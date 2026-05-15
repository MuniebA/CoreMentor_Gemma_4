"""Database access helpers for the CoreMentor mesh coordinator."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

import access
import models
from agents.schemas import OrchestrationRequest


class OrchestrationRepository:
    """Controlled SQLAlchemy boundary used by LangGraph nodes."""

    def __init__(self, db: Session):
        self.db = db

    def load_context(
        self,
        request: OrchestrationRequest,
        actor: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Load all graph context needed by the selected workflow."""

        student_id = request.student_id
        assignment_id = request.assignment_id
        context: Dict[str, Any] = {}

        if request.submission_id:
            submission = access.assert_can_access_submission(self.db, actor, request.submission_id)
            context["submission"] = self._submission_to_dict(submission)
            student_id = student_id or str(submission.student_id)
            assignment_id = assignment_id or str(submission.assignment_id)

        if not student_id and actor.get("role") == "Student":
            student = self._get_student_by_user(actor.get("sub"))
            student_id = str(student.id)

        if student_id:
            student = self._get_student(student_id)
            access.assert_can_access_student(self.db, actor, str(student.id))
            context["student"] = self._student_to_dict(student)
            context["recent_marks"] = self.get_recent_marks(str(student.id), actor=actor)
            context["skill_progress"] = self.get_skill_progress(str(student.id), actor=actor)
            context["open_assignments"] = self.get_open_assignments(str(student.id), actor=actor)

        if assignment_id:
            assignment = access.assert_can_access_assignment(self.db, actor, assignment_id)
            context["assignment"] = self._assignment_to_dict(assignment)
            if assignment.unit_id:
                unit = (
                    self.db.query(models.Unit)
                    .filter(models.Unit.id == assignment.unit_id)
                    .first()
                )
                if unit:
                    context["unit"] = self._unit_to_dict(unit)

        if not context.get("student"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A student context is required for orchestration.",
            )

        return context

    def get_recent_marks(
        self,
        student_id: str,
        actor: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        student_uuid = self._uuid(student_id, "student_id")
        query = (
            self.db.query(models.AIMarkingDraft, models.Submission, models.Assignment)
            .join(
                models.Submission,
                models.Submission.id == models.AIMarkingDraft.submission_id,
            )
            .join(models.Assignment, models.Assignment.id == models.Submission.assignment_id)
            .filter(models.Submission.student_id == student_uuid)
        )
        if actor and actor.get("role") == "Teacher":
            query = query.join(models.Unit, models.Unit.id == models.Assignment.unit_id).filter(
                models.Unit.teacher_id == self._uuid(actor.get("sub"), "user_id")
            )

        rows = query.order_by(models.Submission.uploaded_at.desc()).limit(12).all()

        return [
            {
                "draft_id": str(mark.id),
                "submission_id": str(submission.id),
                "assignment_id": str(assignment.id),
                "assignment_title": assignment.title,
                "score": mark.initial_score,
                "feedback": mark.feedback_text,
                "status": mark.status,
                "confidence_score": mark.confidence_score,
            }
            for mark, submission, assignment in rows
        ]

    def get_skill_progress(
        self,
        student_id: str,
        actor: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        student_uuid = self._uuid(student_id, "student_id")
        query = (
            self.db.query(models.StudentSkillProgress, models.SkillNode)
            .join(models.SkillNode, models.SkillNode.id == models.StudentSkillProgress.node_id)
            .filter(models.StudentSkillProgress.student_id == student_uuid)
        )
        if actor and actor.get("role") == "Teacher":
            query = query.join(models.Unit, models.Unit.id == models.SkillNode.unit_id).filter(
                models.Unit.teacher_id == self._uuid(actor.get("sub"), "user_id")
            )

        rows = query.all()

        return [
            {
                "node_id": str(node.id),
                "node_name": node.node_name,
                "status": progress.status,
                "current_xp": progress.current_xp,
                "xp_to_unlock": node.xp_to_unlock,
            }
            for progress, node in rows
        ]

    def get_open_assignments(
        self,
        student_id: str,
        actor: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        student_uuid = self._uuid(student_id, "student_id")
        enrollment_query = (
            self.db.query(models.Enrollment)
            .filter(models.Enrollment.student_id == student_uuid)
        )
        if actor and actor.get("role") == "Teacher":
            enrollment_query = enrollment_query.join(
                models.Unit,
                models.Unit.id == models.Enrollment.unit_id,
            ).filter(models.Unit.teacher_id == self._uuid(actor.get("sub"), "user_id"))

        enrollments = enrollment_query.all()
        unit_ids = [enrollment.unit_id for enrollment in enrollments]
        if not unit_ids:
            return []

        assignments = (
            self.db.query(models.Assignment)
            .filter(models.Assignment.unit_id.in_(unit_ids))
            .order_by(models.Assignment.due_date.asc())
            .limit(10)
            .all()
        )
        return [self._assignment_to_dict(assignment) for assignment in assignments]

    def persist_graph_outputs(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Persist graph artifacts into existing CoreMentor tables."""

        request = state["request"]
        if not request.get("persist", True):
            return {"skipped": True, "reason": "Request disabled persistence."}

        context = state.get("context", {})
        artifacts = state.get("artifacts", {})
        student = context.get("student") or {}
        student_id = student.get("id")
        persistence: Dict[str, Any] = {}

        if artifacts.get("grader") and context.get("submission"):
            persistence["marking_draft"] = self._upsert_marking_draft(
                submission_id=context["submission"]["id"],
                grader_artifact=artifacts["grader"],
            )

        if artifacts.get("shadow_mentor") and student_id:
            persistence["shadow_mentor"] = self._save_shadow_mentor(
                student_id=student_id,
                mentor_artifact=artifacts["shadow_mentor"],
            )

        if artifacts.get("load_balancer") and student_id:
            persistence["daily_homework_plan"] = self._save_homework_plan(
                student_id=student_id,
                plan_artifact=artifacts["load_balancer"],
            )

        if student_id:
            persistence["agent_comms"] = self._write_agent_comms(
                student_id=student_id,
                state=state,
            )

        self.db.commit()
        return persistence

    def record_agent_run(
        self,
        state: Dict[str, Any],
        actor: Dict[str, Any],
    ) -> Dict[str, Any]:
        context = state.get("context", {})
        request = state.get("request", {})
        student = context.get("student") or {}
        submission = context.get("submission") or {}
        assignment = context.get("assignment") or {}
        errors = state.get("errors", [])

        run = models.AgentRun(
            id=self._uuid(state["run_id"], "run_id"),
            workflow=state.get("workflow") or request.get("workflow") or "auto",
            actor_user_id=self._uuid(actor.get("sub"), "user_id"),
            actor_role=actor.get("role"),
            student_id=self._uuid(student["id"], "student_id") if student.get("id") else None,
            submission_id=(
                self._uuid(submission["id"], "submission_id") if submission.get("id") else None
            ),
            assignment_id=(
                self._uuid(assignment["id"], "assignment_id") if assignment.get("id") else None
            ),
            selected_agents=state.get("selected_agents", []),
            status=state.get("status", "completed"),
            persisted=request.get("persist", True),
            error_summary="\n".join(str(error) for error in errors) if errors else None,
            finished_at=datetime.now(timezone.utc),
        )
        self.db.merge(run)
        self.db.commit()

        return {
            "run_id": str(run.id),
            "table": "agent_runs",
            "status": run.status,
        }

    def _upsert_marking_draft(
        self,
        submission_id: str,
        grader_artifact: Dict[str, Any],
    ) -> Dict[str, Any]:
        draft = (
            self.db.query(models.AIMarkingDraft)
            .filter(
                models.AIMarkingDraft.submission_id
                == self._uuid(submission_id, "submission_id")
            )
            .filter(models.AIMarkingDraft.status == "Pending")
            .first()
        )
        action = "updated"

        if not draft:
            draft = models.AIMarkingDraft(
                submission_id=self._uuid(submission_id, "submission_id")
            )
            self.db.add(draft)
            action = "created"

        draft.initial_score = grader_artifact["initial_score"]
        draft.feedback_text = grader_artifact["feedback_text"]
        draft.status = grader_artifact["status"]
        draft.confidence_score = grader_artifact["confidence_score"]
        draft.agent_log = json.dumps(
            {
                "agent": "The Grader",
                "mistake_patterns": grader_artifact.get("mistake_patterns", []),
                "details": grader_artifact.get("agent_log", {}),
            },
            indent=2,
        )
        self.db.flush()

        return {
            "action": action,
            "draft_id": str(draft.id),
            "status": draft.status,
        }

    def _save_shadow_mentor(
        self,
        student_id: str,
        mentor_artifact: Dict[str, Any],
    ) -> Dict[str, Any]:
        student = self._get_student(student_id)
        student.root_cause_analysis = mentor_artifact.get("root_cause_diagnosis")
        student.teacher_notes = "\n".join(mentor_artifact.get("mentor_notes", []))
        self.db.flush()

        return {
            "student_id": str(student.id),
            "updated_fields": ["root_cause_analysis", "teacher_notes"],
        }

    def _save_homework_plan(
        self,
        student_id: str,
        plan_artifact: Dict[str, Any],
    ) -> Dict[str, Any]:
        plan = models.DailyHomeworkPlan(
            student_id=self._uuid(student_id, "student_id"),
            homework_recipe=plan_artifact,
            is_completed=False,
            planned_for_date=datetime.now(timezone.utc),
        )
        self.db.add(plan)
        self.db.flush()

        return {
            "plan_id": str(plan.id),
            "planned_for_date": plan.planned_for_date.isoformat(),
        }

    def _write_agent_comms(
        self,
        student_id: str,
        state: Dict[str, Any],
    ) -> Dict[str, Any]:
        artifacts = state.get("artifacts", {})
        written: List[Dict[str, str]] = []
        agent_labels = {
            "grader": "The Grader",
            "shadow_mentor": "The Shadow Mentor",
            "load_balancer": "The Load Balancer",
            "career_architect": "The Career Architect",
            "teacher_review": "Teacher Review Gate",
            "gamification": "Gamification Coach",
        }

        coordinator_log = models.AgentInteraction(
            student_id=self._uuid(student_id, "student_id"),
            agent_name="Mesh Coordinator",
            message_payload={
                "run_id": state["run_id"],
                "workflow": state["workflow"],
                "selected_agents": state.get("selected_agents", []),
                "audit_log": state.get("audit_log", []),
            },
        )
        self.db.add(coordinator_log)
        self.db.flush()
        written.append({"agent": "Mesh Coordinator", "interaction_id": str(coordinator_log.id)})

        for artifact_key, artifact in artifacts.items():
            interaction = models.AgentInteraction(
                student_id=self._uuid(student_id, "student_id"),
                agent_name=agent_labels.get(artifact_key, artifact_key),
                message_payload={
                    "run_id": state["run_id"],
                    "workflow": state["workflow"],
                    "artifact": artifact,
                },
            )
            self.db.add(interaction)
            self.db.flush()
            written.append(
                {
                    "agent": agent_labels.get(artifact_key, artifact_key),
                    "interaction_id": str(interaction.id),
                }
            )

        return {"table": "agent_interactions", "written": written}

    def _get_student_by_user(self, user_id: Optional[str]) -> models.StudentProfile:
        student = (
            self.db.query(models.StudentProfile)
            .filter(models.StudentProfile.user_id == self._uuid(user_id, "user_id"))
            .first()
        )
        if not student:
            raise HTTPException(status_code=404, detail="Student profile not found.")
        return student

    def _get_student(self, student_id: str) -> models.StudentProfile:
        student = (
            self.db.query(models.StudentProfile)
            .filter(models.StudentProfile.id == self._uuid(student_id, "student_id"))
            .first()
        )
        if not student:
            raise HTTPException(status_code=404, detail="Student profile not found.")
        return student

    def _get_submission(self, submission_id: str) -> models.Submission:
        submission = (
            self.db.query(models.Submission)
            .filter(models.Submission.id == self._uuid(submission_id, "submission_id"))
            .first()
        )
        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found.")
        return submission

    def _get_assignment(self, assignment_id: str) -> models.Assignment:
        assignment = (
            self.db.query(models.Assignment)
            .filter(models.Assignment.id == self._uuid(assignment_id, "assignment_id"))
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found.")
        return assignment

    @staticmethod
    def _uuid(value: str, field_name: str) -> uuid.UUID:
        try:
            return uuid.UUID(str(value))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field_name} must be a valid UUID.",
            )

    def _student_to_dict(self, student: models.StudentProfile) -> Dict[str, Any]:
        user = self.db.query(models.User).filter(models.User.id == student.user_id).first()
        return {
            "id": str(student.id),
            "user_id": str(student.user_id),
            "full_name": user.full_name if user else "Unknown student",
            "career_goal": student.career_goal,
            "career_pathway_data": student.career_pathway_data or {},
            "level": student.level,
            "total_xp": student.total_xp,
            "rank_title": student.rank_title,
            "teacher_notes": student.teacher_notes,
            "root_cause_analysis": student.root_cause_analysis,
        }

    @staticmethod
    def _assignment_to_dict(assignment: models.Assignment) -> Dict[str, Any]:
        return {
            "id": str(assignment.id),
            "unit_id": str(assignment.unit_id) if assignment.unit_id else None,
            "title": assignment.title,
            "type": assignment.type,
            "due_date": assignment.due_date.isoformat() if assignment.due_date else None,
            "is_weighted": assignment.is_weighted,
            "weight_percentage": assignment.weight_percentage,
            "answer_key_url": assignment.answer_key_url,
            "skill_node_id": str(assignment.skill_node_id) if assignment.skill_node_id else None,
        }

    @staticmethod
    def _submission_to_dict(submission: models.Submission) -> Dict[str, Any]:
        return {
            "id": str(submission.id),
            "student_id": str(submission.student_id),
            "assignment_id": str(submission.assignment_id),
            "image_url": submission.image_url,
            "uploaded_at": submission.uploaded_at.isoformat() if submission.uploaded_at else None,
        }

    @staticmethod
    def _unit_to_dict(unit: models.Unit) -> Dict[str, Any]:
        return {
            "id": str(unit.id),
            "unit_name": unit.unit_name,
            "description": unit.description,
            "syllabus_url": unit.syllabus_url,
            "teacher_id": str(unit.teacher_id) if unit.teacher_id else None,
        }
