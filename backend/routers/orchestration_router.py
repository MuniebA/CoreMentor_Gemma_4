"""FastAPI routes for the CoreMentor LangGraph orchestration layer."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import auth
import access
import models
from agents.coordinator import MeshCoordinator, MeshCoordinatorBusyError
from agents.runtime import CoreMentorRuntime
from agents.schemas import (
    OrchestrationRequest,
    OrchestrationResponse,
    StudentInsightChatRequest,
    StudentInsightChatResponse,
)
from agents.student_insight_chat import StudentInsightChatService
from database import SessionLocal


router = APIRouter(prefix="/orchestration", tags=["LangGraph Orchestration"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/run", response_model=OrchestrationResponse)
def run_orchestration(
    request: OrchestrationRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.decode_token),
):
    """Run the Mesh Coordinator for grading, mentoring, planning, or career lens."""

    coordinator = MeshCoordinator(db)
    try:
        return coordinator.run(request=request, actor=payload)
    except MeshCoordinatorBusyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )


@router.get("/health")
def orchestration_health(payload: dict = Depends(auth.require_role("Admin", "Teacher"))):
    """Expose the orchestration shape without running local inference."""

    runtime = CoreMentorRuntime()
    return {
        "status": "ready",
        "coordinator": "Mesh Coordinator",
        "graph": [
            "intake",
            "grader",
            "teacher_review_gate",
            "shadow_mentor",
            "load_balancer",
            "career_architect",
            "persist_outputs",
        ],
        "single_inference_lock": True,
        "audit_log_table": "agent_interactions",
        "runtime": runtime.status(),
    }


@router.post("/chroma/init")
def initialize_chroma(payload: dict = Depends(auth.require_role("Teacher", "Admin"))):
    """Create persistent ChromaDB collections for CoreMentor semantic memory."""

    runtime = CoreMentorRuntime()
    memory = runtime.memory
    if memory is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=runtime.status(),
        )

    return {
        "message": "ChromaDB collections are ready.",
        "collections": memory.ensure_collections(),
        "runtime": runtime.status(),
    }


@router.post("/chat/student", response_model=StudentInsightChatResponse)
def chat_about_student(
    request: StudentInsightChatRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin")),
):
    """Teacher/admin RAG chat over one authorized student's Postgres and Chroma data."""

    service = StudentInsightChatService(db=db, runtime=CoreMentorRuntime())
    try:
        return service.answer(request=request, actor=payload)
    except MeshCoordinatorBusyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.get("/audit/{student_id}")
def get_agent_audit(
    student_id: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin")),
):
    """Return recent persisted agent outputs for a student's test run."""

    student = access.assert_can_access_student(db, payload, student_id)

    runs = (
        db.query(models.AgentRun)
        .filter(models.AgentRun.student_id == student.id)
        .order_by(models.AgentRun.started_at.desc())
        .limit(10)
        .all()
    )
    interactions = (
        db.query(models.AgentInteraction)
        .filter(models.AgentInteraction.student_id == student.id)
        .order_by(models.AgentInteraction.timestamp.desc())
        .limit(20)
        .all()
    )
    plans = (
        db.query(models.DailyHomeworkPlan)
        .filter(models.DailyHomeworkPlan.student_id == student.id)
        .order_by(models.DailyHomeworkPlan.planned_for_date.desc())
        .limit(5)
        .all()
    )
    drafts = (
        db.query(models.AIMarkingDraft, models.Submission)
        .join(models.Submission, models.Submission.id == models.AIMarkingDraft.submission_id)
        .filter(models.Submission.student_id == student.id)
        .order_by(models.Submission.uploaded_at.desc())
        .limit(10)
        .all()
    )

    return {
        "student_id": student_id,
        "agent_runs": [
            {
                "id": str(run.id),
                "workflow": run.workflow,
                "actor_user_id": str(run.actor_user_id) if run.actor_user_id else None,
                "actor_role": run.actor_role,
                "submission_id": str(run.submission_id) if run.submission_id else None,
                "assignment_id": str(run.assignment_id) if run.assignment_id else None,
                "selected_agents": run.selected_agents or [],
                "status": run.status,
                "persisted": run.persisted,
                "error_summary": run.error_summary,
                "started_at": run.started_at.isoformat() if run.started_at else None,
                "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            }
            for run in runs
        ],
        "agent_interactions": [
            {
                "id": str(item.id),
                "agent_name": item.agent_name,
                "message_payload": item.message_payload,
                "timestamp": item.timestamp.isoformat() if item.timestamp else None,
            }
            for item in interactions
        ],
        "daily_homework_plans": [
            {
                "id": str(plan.id),
                "homework_recipe": plan.homework_recipe,
                "is_completed": plan.is_completed,
                "planned_for_date": (
                    plan.planned_for_date.isoformat() if plan.planned_for_date else None
                ),
            }
            for plan in plans
        ],
        "marking_drafts": [
            {
                "id": str(draft.id),
                "submission_id": str(submission.id),
                "initial_score": draft.initial_score,
                "status": draft.status,
                "confidence_score": draft.confidence_score,
                "agent_log": draft.agent_log,
            }
            for draft, submission in drafts
        ],
    }
