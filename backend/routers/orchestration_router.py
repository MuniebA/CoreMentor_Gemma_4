"""FastAPI routes for the CoreMentor LangGraph orchestration layer."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import auth
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
def initialize_chroma(payload: dict = Depends(auth.require_role("Admin"))):
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
