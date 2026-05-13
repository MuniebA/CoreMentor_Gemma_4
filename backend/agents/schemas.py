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


class StudentInsightChatTurn(BaseModel):
    """Short chat history item supplied by the teacher UI."""

    role: Literal["teacher", "assistant"]
    content: str = Field(max_length=4000)


class StudentInsightChatRequest(BaseModel):
    """Teacher-facing RAG chat request for one student."""

    student_id: str = Field(description="Target student profile ID.")
    question: str = Field(min_length=3, max_length=2000)
    conversation: List[StudentInsightChatTurn] = Field(default_factory=list, max_length=8)


class StudentInsightSource(BaseModel):
    """Source shown with the answer so teachers can inspect where evidence came from."""

    id: str
    kind: Literal["postgres", "chroma"]
    title: str
    summary: str


class StudentInsightChatResponse(BaseModel):
    """Answer returned by the teacher student-insight chat sidecar."""

    student_id: str
    answer: str
    confidence: Literal["low", "medium", "high"]
    recommended_next_steps: List[str] = Field(default_factory=list)
    source_ids_used: List[str] = Field(default_factory=list)
    sources: List[StudentInsightSource] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)
    retrieval: Dict[str, Any] = Field(default_factory=dict)
