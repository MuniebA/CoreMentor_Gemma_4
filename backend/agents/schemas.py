"""Shared request and response schemas for CoreMentor agent orchestration."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


WorkflowName = Literal[
    "auto",
    "grade_submission",
    "student_support",
    "career_lens",
    "daily_plan",
]


class OrchestrationRequest(BaseModel):
    """Input contract for the CoreMentor LangGraph workflow."""

    workflow: WorkflowName = Field(
        default="auto",
        description="Workflow to run. Auto selects agents from the supplied IDs.",
    )
    student_id: Optional[str] = Field(
        default=None,
        description="Target student profile ID. Students can omit this for themselves.",
    )
    assignment_id: Optional[str] = Field(
        default=None,
        description="Assignment ID for career lens or submission grading context.",
    )
    submission_id: Optional[str] = Field(
        default=None,
        description="Submission ID when grading uploaded homework.",
    )
    persist: bool = Field(
        default=True,
        description="When true, save graph artifacts into the existing CoreMentor tables.",
    )
    teacher_review_required: bool = Field(
        default=True,
        description="Keep AI marking drafts pending for human review.",
    )
    notes: Optional[str] = Field(
        default=None,
        max_length=2000,
        description="Optional instruction or context supplied by the caller.",
    )


class OrchestrationResponse(BaseModel):
    """Public response returned by the orchestration router."""

    run_id: str
    workflow: str
    status: str
    selected_agents: List[str]
    artifacts: Dict[str, Any]
    persistence: Dict[str, Any]
    audit_log: List[str]
    errors: List[str] = Field(default_factory=list)

