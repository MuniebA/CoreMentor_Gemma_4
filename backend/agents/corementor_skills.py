"""Agent skills used by the CoreMentor LangGraph runner.

Each function starts from a deterministic artifact, then enriches it through
the optional local runtime adapters when Ollama, ChromaDB, and Docling are
available. This keeps the graph usable even while local services are offline.
"""

from __future__ import annotations

from datetime import datetime, timezone
from statistics import mean
from typing import Any, Dict, Iterable, List, Optional


def build_marking_draft(
    context: Dict[str, Any],
    teacher_review_required: bool,
    runtime: Optional[Any] = None,
) -> Dict[str, Any]:
    """Create a provisional marking draft from the available submission context."""

    submission = context.get("submission") or {}
    assignment = context.get("assignment") or {}
    student = context.get("student") or {}

    evidence_score = 70.0
    evidence: List[str] = []

    parsed_submission = _load_submission_text(runtime, submission.get("image_url"))
    if parsed_submission.get("available"):
        evidence_score += 8.0
        evidence.append(parsed_submission["detail"])
    elif submission.get("image_url"):
        evidence_score += 4.0
        evidence.append("student submission file is available but was not parsed")

    if assignment.get("answer_key_url"):
        evidence_score += 12.0
        evidence.append("teacher answer key is available")
    else:
        evidence.append("teacher answer key is missing")

    if assignment.get("skill_node_id"):
        evidence_score += 4.0
        evidence.append("assignment is linked to a skill node")

    if assignment.get("is_weighted"):
        evidence.append(f"weighted assessment at {assignment.get('weight_percentage', 0)}%")

    score = max(0.0, min(100.0, evidence_score))
    confidence = 0.54 + (0.18 if assignment.get("answer_key_url") else 0.0)
    confidence += 0.12 if submission.get("image_url") else 0.0
    confidence = round(min(confidence, 0.92), 2)

    status = "Pending" if teacher_review_required else "Approved"
    student_name = student.get("full_name", "the student")
    assignment_title = assignment.get("title", "this assignment")
    mistake_patterns = _infer_mistake_patterns(assignment, evidence)

    artifact = {
        "agent": "grader",
        "status": status,
        "initial_score": round(score, 2),
        "confidence_score": confidence,
        "mistake_patterns": mistake_patterns,
        "feedback_text": (
            f"Provisional review for {student_name} on {assignment_title}. "
            "Check the reasoning against the uploaded work before releasing the result."
        ),
        "agent_log": {
            "summary": "Vision grading scaffold generated a review-ready draft.",
            "evidence": evidence,
            "limitations": [
                "Docling and Gemma enrichment fall back to deterministic scoring when unavailable.",
                "Teacher review is recommended before publishing feedback.",
            ],
            "parsed_submission_preview": parsed_submission.get("text", "")[:1000],
        },
    }

    if runtime is not None:
        artifact = runtime.invoke_json(
            messages=[
                (
                    "system",
                    "You are The Grader in CoreMentor. Return only JSON that matches "
                    "the existing keys. Keep status Pending unless told otherwise.",
                ),
                (
                    "human",
                    _json_context(
                        {
                            "task": "Create a first-pass homework marking draft.",
                            "student": student,
                            "assignment": assignment,
                            "submission": submission,
                            "parsed_submission_text": parsed_submission.get("text", ""),
                            "fallback_artifact": artifact,
                        }
                    ),
                ),
            ],
            fallback=artifact,
        )

    return artifact


def build_shadow_mentor_profile(
    context: Dict[str, Any],
    runtime: Optional[Any] = None,
) -> Dict[str, Any]:
    """Summarize learning patterns from marks, notes, and skill progress."""

    student = context.get("student") or {}
    recent_marks = context.get("recent_marks") or []
    skill_progress = context.get("skill_progress") or []

    scores = [
        item["score"]
        for item in recent_marks
        if isinstance(item.get("score"), (int, float))
    ]
    average_score = round(mean(scores), 2) if scores else None

    in_progress_skills = [
        item["node_name"]
        for item in skill_progress
        if item.get("status") == "In-Progress"
    ]
    locked_skills = [
        item["node_name"]
        for item in skill_progress
        if item.get("status") == "Locked"
    ]

    patterns: List[str] = []
    latest_grader = context.get("grader") or {}
    if latest_grader.get("mistake_patterns"):
        patterns.extend(latest_grader["mistake_patterns"])
    if average_score is not None and average_score < 75:
        patterns.append("recent assessment average is below the support threshold")
    if in_progress_skills:
        patterns.append("active skill work is concentrated in " + ", ".join(in_progress_skills[:3]))
    if locked_skills:
        patterns.append("locked skills may need prerequisite practice")
    if not patterns:
        patterns.append("no high-risk pattern detected from the available records")

    career_goal = student.get("career_goal") or "Undecided"
    memory_hits = _search_student_memory(runtime, student.get("id"), patterns)
    diagnosis = (
        f"{student.get('full_name', 'Student')} is working toward {career_goal}. "
        f"Current rank is {student.get('rank_title', 'Novice')}. "
        f"Primary pattern: {patterns[0]}."
    )

    artifact = {
        "agent": "shadow_mentor",
        "average_score": average_score,
        "patterns": patterns,
        "memory_hits": memory_hits,
        "priority_subjects": _build_priority_subjects(patterns),
        "root_cause_diagnosis": diagnosis,
        "mentor_notes": [
            "Use short retrieval practice before new homework.",
            "Connect each task to the student's career goal to improve motivation.",
            "Escalate to teacher review if two or more weak submissions repeat the same skill.",
        ],
    }

    if runtime is not None:
        artifact = runtime.invoke_json(
            messages=[
                (
                    "system",
                    "You are The Shadow Mentor in CoreMentor. Diagnose long-term "
                    "learning causes. Return only JSON matching the existing keys.",
                ),
                (
                    "human",
                    _json_context(
                        {
                            "task": "Diagnose root causes and priority subjects.",
                            "student": student,
                            "recent_marks": recent_marks,
                            "skill_progress": skill_progress,
                            "memory_hits": memory_hits,
                            "fallback_artifact": artifact,
                        }
                    ),
                ),
            ],
            fallback=artifact,
        )

    _save_student_patterns(runtime, student.get("id"), artifact.get("patterns", []))
    return artifact


def build_career_lens(
    context: Dict[str, Any],
    runtime: Optional[Any] = None,
) -> Dict[str, Any]:
    """Translate a coursework task into a career-themed exercise."""

    student = context.get("student") or {}
    assignment = context.get("assignment") or {}
    unit = context.get("unit") or {}

    career_goal = student.get("career_goal") or "future professional"
    title = assignment.get("title") or "Selected task"
    unit_name = unit.get("unit_name") or "the unit"
    career_examples = _search_career_memory(runtime, career_goal, title)

    artifact = {
        "agent": "career_architect",
        "original_title": title,
        "themed_title": f"{title} for a future {career_goal}",
        "career_context": (
            f"This task reframes {unit_name} content through the daily decisions "
            f"a {career_goal} would make."
        ),
        "themed_instructions": [
            f"Start by naming the professional problem a {career_goal} is solving.",
            "Show the academic method before applying the career scenario.",
            "End with one sentence explaining how the method improves a real decision.",
        ],
        "career_examples": career_examples,
    }

    if runtime is not None:
        artifact = runtime.invoke_json(
            messages=[
                (
                    "system",
                    "You are The Career Architect in CoreMentor. Rewrite learning "
                    "tasks with career relevance while preserving academic meaning. "
                    "Return only JSON matching the existing keys.",
                ),
                (
                    "human",
                    _json_context(
                        {
                            "task": "Create a career-themed learning version.",
                            "student": student,
                            "assignment": assignment,
                            "unit": unit,
                            "career_examples": career_examples,
                            "fallback_artifact": artifact,
                        }
                    ),
                ),
            ],
            fallback=artifact,
        )

    return artifact


def build_homework_plan(
    context: Dict[str, Any],
    runtime: Optional[Any] = None,
) -> Dict[str, Any]:
    """Create a daily homework recipe from deadlines and learning patterns."""

    student = context.get("student") or {}
    assignments = context.get("open_assignments") or []
    mentor = context.get("shadow_mentor") or {}

    weak_focus = _first_or_default(mentor.get("patterns"), "retrieval practice")
    first_assignment = _first_or_default(
        [item.get("title") for item in assignments if item.get("title")],
        "current coursework",
    )
    career_goal = student.get("career_goal") or "career goal"

    blocks = [
        {
            "name": "Review",
            "minutes": 15,
            "purpose": f"Warm up with {weak_focus}.",
        },
        {
            "name": "Deep Work",
            "minutes": 35,
            "purpose": f"Complete the highest-priority task: {first_assignment}.",
        },
        {
            "name": "Career Link",
            "minutes": 10,
            "purpose": f"Write how today's method connects to {career_goal}.",
        },
    ]

    artifact = {
        "agent": "load_balancer",
        "planned_for_date": datetime.now(timezone.utc).isoformat(),
        "total_minutes": sum(block["minutes"] for block in blocks),
        "homework_recipe": {
            "review": {"minutes": 15, "focus": weak_focus},
            "deep_work": {"minutes": 35, "focus": first_assignment},
            "career_link": {"minutes": 10, "focus": career_goal},
        },
        "blocks": blocks,
        "completion_signal": "Student can explain the method without looking at the notes.",
    }

    if runtime is not None:
        artifact = runtime.invoke_json(
            messages=[
                (
                    "system",
                    "You are The Load Balancer in CoreMentor. Keep the workload "
                    "reasonable and preserve the computed time budget. Return only JSON.",
                ),
                (
                    "human",
                    _json_context(
                        {
                            "task": "Explain and lightly refine the daily homework plan.",
                            "student": student,
                            "open_assignments": assignments,
                            "shadow_mentor": mentor,
                            "fallback_artifact": artifact,
                        }
                    ),
                ),
            ],
            fallback=artifact,
        )

    return artifact


def build_gamification_recommendation(context: Dict[str, Any]) -> Dict[str, Any]:
    """Recommend XP and rank movement without mutating the student balance."""

    student = context.get("student") or {}
    skill_progress = context.get("skill_progress") or []

    mastered = sum(1 for item in skill_progress if item.get("status") == "Mastered")
    in_progress = sum(1 for item in skill_progress if item.get("status") == "In-Progress")
    recommended_xp = 25 + (mastered * 10) + (in_progress * 5)

    return {
        "agent": "gamification_coach",
        "current_xp": student.get("total_xp", 0),
        "rank_title": student.get("rank_title", "Novice"),
        "recommended_xp_award": recommended_xp,
        "reason": "Award after teacher approval or verified homework completion.",
    }


def _first_or_default(values: Iterable[Any], default: Any) -> Any:
    for value in values:
        if value:
            return value
    return default


def _infer_mistake_patterns(assignment: Dict[str, Any], evidence: List[str]) -> List[str]:
    title = (assignment.get("title") or "").lower()
    patterns: List[str] = []

    if "motion" in title or "physics" in title:
        patterns.append("needs more practice linking formulas to motion scenarios")
    if "derivative" in title or "calculus" in title:
        patterns.append("needs more practice showing each algebraic transformation")
    if "essay" in title:
        patterns.append("needs more practice supporting claims with evidence")
    if "teacher answer key is missing" in evidence:
        patterns.append("grading confidence is limited because the answer key is missing")

    return patterns or ["needs teacher-confirmed mistake extraction from the submitted work"]


def _build_priority_subjects(patterns: List[str]) -> List[Dict[str, str]]:
    priorities: List[Dict[str, str]] = []
    for pattern in patterns[:4]:
        subject = "General"
        if "motion" in pattern or "formula" in pattern:
            subject = "Physics"
        elif "algebra" in pattern or "calculus" in pattern:
            subject = "Mathematics"
        elif "evidence" in pattern or "essay" in pattern:
            subject = "Writing"

        priorities.append(
            {
                "subject": subject,
                "skill": pattern,
                "priority": "high" if len(priorities) == 0 else "medium",
            }
        )

    return priorities


def _load_submission_text(runtime: Optional[Any], file_path: Optional[str]) -> Dict[str, str]:
    if runtime is None or not file_path:
        return {"available": False, "text": "", "detail": "Docling was not invoked."}

    documents = getattr(runtime, "documents", None)
    if documents is None:
        return {"available": False, "text": "", "detail": "Docling is unavailable."}

    return documents.load_text(file_path)


def _search_student_memory(
    runtime: Optional[Any],
    student_id: Optional[str],
    patterns: List[str],
) -> List[str]:
    if runtime is None or not student_id:
        return []

    memory = getattr(runtime, "memory", None)
    if memory is None:
        return []

    query = "; ".join(patterns) or "student learning patterns"
    try:
        return memory.search_student_patterns(student_id=student_id, query=query)
    except Exception:
        return []


def _save_student_patterns(
    runtime: Optional[Any],
    student_id: Optional[str],
    patterns: List[str],
) -> None:
    if runtime is None or not student_id or not patterns:
        return

    memory = getattr(runtime, "memory", None)
    if memory is None:
        return

    try:
        memory.add_student_pattern(student_id=student_id, texts=patterns)
    except Exception:
        return


def _search_career_memory(
    runtime: Optional[Any],
    career_goal: str,
    query: str,
) -> List[str]:
    if runtime is None:
        return []

    memory = getattr(runtime, "memory", None)
    if memory is None:
        return []

    try:
        return memory.search_career_data(career_goal=career_goal, query=query)
    except Exception:
        return []


def _json_context(payload: Dict[str, Any]) -> str:
    import json

    return json.dumps(payload, indent=2, default=str)
