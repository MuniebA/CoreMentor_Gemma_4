"""FastAPI routes for the CoreMentor LangGraph orchestration layer."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import auth
import models
from agents.coordinator import MeshCoordinator, MeshCoordinatorBusyError
from agents.runtime import CoreMentorRuntime
from agents.schemas import OrchestrationRequest, OrchestrationResponse
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


@router.get("/audit/{student_id}")
def get_agent_audit(
    student_id: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin")),
):
    """Return recent persisted agent outputs for a student's test run."""

    interactions = (
        db.query(models.AgentInteraction)
        .filter(models.AgentInteraction.student_id == student_id)
        .order_by(models.AgentInteraction.timestamp.desc())
        .limit(20)
        .all()
    )
    plans = (
        db.query(models.DailyHomeworkPlan)
        .filter(models.DailyHomeworkPlan.student_id == student_id)
        .order_by(models.DailyHomeworkPlan.planned_for_date.desc())
        .limit(5)
        .all()
    )
    drafts = (
        db.query(models.AIMarkingDraft, models.Submission)
        .join(models.Submission, models.Submission.id == models.AIMarkingDraft.submission_id)
        .filter(models.Submission.student_id == student_id)
        .order_by(models.Submission.uploaded_at.desc())
        .limit(10)
        .all()
    )

    return {
        "student_id": student_id,
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
