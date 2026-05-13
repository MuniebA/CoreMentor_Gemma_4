"""Mesh Coordinator service that runs the CoreMentor LangGraph safely."""

from __future__ import annotations

from threading import Lock
from typing import Any, Dict

from sqlalchemy.orm import Session

import access
from agents.graph import build_corementor_graph, make_initial_state
from agents.repository import OrchestrationRepository
from agents.runtime import CoreMentorRuntime
from agents.schemas import OrchestrationRequest, OrchestrationResponse


class MeshCoordinatorBusyError(RuntimeError):
    """Raised when another local inference workflow is already running."""


class MeshCoordinator:
    """Single-entry coordinator for local agentic workflows."""

    _inference_lock = Lock()

    @classmethod
    def acquire_inference_slot(cls) -> bool:
        return cls._inference_lock.acquire(blocking=False)

    @classmethod
    def release_inference_slot(cls) -> None:
        cls._inference_lock.release()

    def __init__(self, db: Session):
        self.repository = OrchestrationRepository(db)
        self.runtime = CoreMentorRuntime()

    def run(
        self,
        request: OrchestrationRequest,
        actor: Dict[str, Any],
    ) -> OrchestrationResponse:
        access.assert_can_run_workflow(actor, request.workflow, request.submission_id)
        acquired = self.acquire_inference_slot()
        if not acquired:
            raise MeshCoordinatorBusyError(
                "Another CoreMentor agent workflow is already running. Try again shortly."
            )

        try:
            graph = build_corementor_graph(self.repository, runtime=self.runtime)
            final_state = graph.invoke(make_initial_state(request=request, actor=actor))
            final_state.setdefault("persistence", {})["agent_run"] = self.repository.record_agent_run(
                final_state,
                actor,
            )
        finally:
            self.release_inference_slot()

        return OrchestrationResponse(
            run_id=final_state["run_id"],
            workflow=final_state["workflow"],
            status=final_state["status"],
            selected_agents=final_state.get("selected_agents", []),
            artifacts=final_state.get("artifacts", {}),
            persistence=final_state.get("persistence", {}),
            audit_log=final_state.get("audit_log", []),
            errors=final_state.get("errors", []),
        )
