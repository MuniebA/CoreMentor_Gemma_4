"""LangGraph definition for the CoreMentor local agentic mesh."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, TypedDict

from agents.corementor_skills import (
    build_career_lens,
    build_gamification_recommendation,
    build_homework_plan,
    build_marking_draft,
    build_shadow_mentor_profile,
)
from agents.repository import OrchestrationRepository
from agents.schemas import OrchestrationRequest


class CoreMentorGraphState(TypedDict, total=False):
    """Mutable state passed between LangGraph nodes."""

    run_id: str
    workflow: str
    request: Dict[str, Any]
    actor: Dict[str, Any]
    context: Dict[str, Any]
    selected_agents: List[str]
    artifacts: Dict[str, Any]
    persistence: Dict[str, Any]
    audit_log: List[str]
    errors: List[str]
    status: str


def build_corementor_graph(repository: OrchestrationRepository, runtime: Any = None):
    """Build and compile the Mesh Coordinator graph.

    LangGraph is imported lazily so FastAPI can still expose a clear dependency
    error if the orchestration package is not installed yet.
    """

    try:
        from langgraph.graph import END, START, StateGraph
    except ImportError as exc:
        raise RuntimeError(
            "LangGraph is required for CoreMentor orchestration. "
            "Install backend requirements before calling this endpoint."
        ) from exc

    graph = StateGraph(CoreMentorGraphState)

    graph.add_node("intake", _intake_node(repository))
    graph.add_node("grader", _grader_node(runtime))
    graph.add_node("teacher_review_gate", _teacher_review_gate_node)
    graph.add_node("shadow_mentor", _shadow_mentor_node(runtime))
    graph.add_node("load_balancer", _load_balancer_node(runtime))
    graph.add_node("career_architect", _career_architect_node(runtime))
    graph.add_node("persist_outputs", _persist_outputs_node(repository))
    graph.add_node("finalize", _finalize_node)

    graph.add_edge(START, "intake")
    graph.add_conditional_edges(
        "intake",
        _route_after_intake,
        {
            "grader": "grader",
            "shadow_mentor": "shadow_mentor",
            "load_balancer": "load_balancer",
            "career_architect": "career_architect",
            "persist_outputs": "persist_outputs",
        },
    )
    graph.add_edge("grader", "teacher_review_gate")
    graph.add_conditional_edges(
        "teacher_review_gate",
        _route_after_grader,
        {
            "shadow_mentor": "shadow_mentor",
            "load_balancer": "load_balancer",
            "career_architect": "career_architect",
            "persist_outputs": "persist_outputs",
        },
    )
    graph.add_conditional_edges(
        "shadow_mentor",
        _route_after_shadow_mentor,
        {
            "load_balancer": "load_balancer",
            "career_architect": "career_architect",
            "persist_outputs": "persist_outputs",
        },
    )
    graph.add_conditional_edges(
        "load_balancer",
        _route_after_load_balancer,
        {
            "career_architect": "career_architect",
            "persist_outputs": "persist_outputs",
        },
    )
    graph.add_edge("career_architect", "persist_outputs")
    graph.add_edge("persist_outputs", "finalize")
    graph.add_edge("finalize", END)

    return graph.compile()


def make_initial_state(
    request: OrchestrationRequest,
    actor: Dict[str, Any],
) -> CoreMentorGraphState:
    return {
        "run_id": str(uuid.uuid4()),
        "workflow": request.workflow,
        "request": request.model_dump(),
        "actor": actor,
        "context": {},
        "selected_agents": [],
        "artifacts": {},
        "persistence": {},
        "audit_log": [],
        "errors": [],
        "status": "running",
    }


def _intake_node(repository: OrchestrationRepository):
    def node(state: CoreMentorGraphState) -> CoreMentorGraphState:
        request = OrchestrationRequest(**state["request"])
        context = repository.load_context(request=request, actor=state["actor"])
        context["_run_id"] = state["run_id"]
        context["_actor"] = {
            "user_id": state["actor"].get("sub"),
            "role": state["actor"].get("role"),
        }
        selected_agents = _select_agents(request=request)

        return {
            **state,
            "context": context,
            "selected_agents": selected_agents,
            "audit_log": _append_log(
                state,
                f"Mesh Coordinator selected agents: {', '.join(selected_agents) or 'none'}.",
            ),
        }

    return node


def _grader_node(runtime: Any = None):
    def node(state: CoreMentorGraphState) -> CoreMentorGraphState:
        context = dict(state["context"])
        artifact = build_marking_draft(
            context=context,
            teacher_review_required=state["request"].get("teacher_review_required", True),
            runtime=runtime,
        )
        artifacts = _put_artifact(state, "grader", artifact)
        context["grader"] = artifact

        return {
            **state,
            "context": context,
            "artifacts": artifacts,
            "audit_log": _append_log(
                state,
                "The Grader created a pending marking draft artifact.",
            ),
        }

    return node


def _teacher_review_gate_node(state: CoreMentorGraphState) -> CoreMentorGraphState:
    grader = state.get("artifacts", {}).get("grader", {})
    status = grader.get("status", "Pending")
    artifact = {
        "agent": "teacher_review_gate",
        "requires_teacher_review": status == "Pending",
        "draft_status": status,
        "message": "Teacher remains the final authority before grades are released.",
    }

    return {
        **state,
        "artifacts": _put_artifact(state, "teacher_review", artifact),
        "audit_log": _append_log(
            state,
            "Teacher review gate marked the draft as human-in-the-loop.",
        ),
    }


def _shadow_mentor_node(runtime: Any = None):
    def node(state: CoreMentorGraphState) -> CoreMentorGraphState:
        context = dict(state["context"])
        artifact = build_shadow_mentor_profile(context, runtime=runtime)
        artifacts = _put_artifact(state, "shadow_mentor", artifact)
        context["shadow_mentor"] = artifact

        return {
            **state,
            "context": context,
            "artifacts": artifacts,
            "audit_log": _append_log(
                state,
                "The Shadow Mentor diagnosed learning patterns.",
            ),
        }

    return node


def _load_balancer_node(runtime: Any = None):
    def node(state: CoreMentorGraphState) -> CoreMentorGraphState:
        context = dict(state["context"])
        artifact = build_homework_plan(context, runtime=runtime)
        artifacts = _put_artifact(state, "load_balancer", artifact)
        context["load_balancer"] = artifact

        return {
            **state,
            "context": context,
            "artifacts": artifacts,
            "audit_log": _append_log(
                state,
                "The Load Balancer generated a daily homework recipe.",
            ),
        }

    return node


def _career_architect_node(runtime: Any = None):
    def node(state: CoreMentorGraphState) -> CoreMentorGraphState:
        context = dict(state["context"])
        career_artifact = build_career_lens(context, runtime=runtime)
        gamification_artifact = build_gamification_recommendation(context)
        artifacts = _put_artifact(state, "career_architect", career_artifact)
        artifacts["gamification"] = gamification_artifact
        context["career_architect"] = career_artifact
        context["gamification"] = gamification_artifact

        return {
            **state,
            "context": context,
            "artifacts": artifacts,
            "audit_log": _append_log(
                state,
                "The Career Architect produced a career-themed learning artifact.",
            ),
        }

    return node


def _persist_outputs_node(repository: OrchestrationRepository):
    def node(state: CoreMentorGraphState) -> CoreMentorGraphState:
        persistence = repository.persist_graph_outputs(state)
        return {
            **state,
            "persistence": persistence,
            "audit_log": _append_log(state, "Mesh Coordinator persisted graph outputs."),
        }

    return node


def _finalize_node(state: CoreMentorGraphState) -> CoreMentorGraphState:
    status = "completed" if not state.get("errors") else "completed_with_errors"
    return {
        **state,
        "status": status,
        "audit_log": _append_log(state, f"Mesh Coordinator finalized run with status: {status}."),
    }


def _select_agents(request: OrchestrationRequest) -> List[str]:
    if request.workflow == "grade_submission":
        return ["grader", "shadow_mentor", "load_balancer", "career_architect"]
    if request.workflow == "student_support":
        return ["shadow_mentor", "load_balancer", "career_architect"]
    if request.workflow == "daily_plan":
        return ["shadow_mentor", "load_balancer", "career_architect"]
    if request.workflow == "career_lens":
        return ["career_architect"]
    if request.submission_id:
        return ["grader", "shadow_mentor", "load_balancer", "career_architect"]
    if request.assignment_id:
        return ["career_architect"]
    return ["shadow_mentor", "load_balancer", "career_architect"]


def _route_after_intake(state: CoreMentorGraphState) -> str:
    return _next_selected_agent(
        state,
        ["grader", "shadow_mentor", "load_balancer", "career_architect"],
    )


def _route_after_grader(state: CoreMentorGraphState) -> str:
    return _next_selected_agent(state, ["shadow_mentor", "load_balancer", "career_architect"])


def _route_after_shadow_mentor(state: CoreMentorGraphState) -> str:
    return _next_selected_agent(state, ["load_balancer", "career_architect"])


def _route_after_load_balancer(state: CoreMentorGraphState) -> str:
    return _next_selected_agent(state, ["career_architect"])


def _next_selected_agent(state: CoreMentorGraphState, ordered_candidates: List[str]) -> str:
    selected = state.get("selected_agents", [])
    for candidate in ordered_candidates:
        if candidate in selected:
            return candidate
    return "persist_outputs"


def _put_artifact(
    state: CoreMentorGraphState,
    key: str,
    artifact: Dict[str, Any],
) -> Dict[str, Any]:
    artifacts = dict(state.get("artifacts", {}))
    artifacts[key] = artifact
    return artifacts


def _append_log(state: CoreMentorGraphState, message: str) -> List[str]:
    return [*state.get("audit_log", []), message]
