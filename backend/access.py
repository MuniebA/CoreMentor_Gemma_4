"""Shared access policy helpers for student-scoped CoreMentor data."""

from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

import models


def assert_can_access_student(
    db: Session,
    actor: Dict[str, Any],
    student_id: str,
) -> models.StudentProfile:
    student = _get_student(db, student_id)
    if can_access_student(db, actor, student):
        return student
    raise _forbidden("You do not have access to this student.")


def assert_can_access_unit(
    db: Session,
    actor: Dict[str, Any],
    unit_id: str,
) -> models.Unit:
    unit = _get_unit(db, unit_id)
    if can_access_unit(db, actor, unit):
        return unit
    raise _forbidden("You do not have access to this unit.")


def assert_can_access_assignment(
    db: Session,
    actor: Dict[str, Any],
    assignment_id: str,
) -> models.Assignment:
    assignment = _get_assignment(db, assignment_id)
    if actor.get("role") == "Admin":
        return assignment
    if assignment.unit_id and can_access_unit_id(db, actor, str(assignment.unit_id)):
        return assignment
    raise _forbidden("You do not have access to this assignment.")


def assert_can_access_submission(
    db: Session,
    actor: Dict[str, Any],
    submission_id: str,
) -> models.Submission:
    submission = _get_submission(db, submission_id)
    if can_access_submission(db, actor, submission):
        return submission
    raise _forbidden("You do not have access to this submission.")


def assert_can_access_marking_draft(
    db: Session,
    actor: Dict[str, Any],
    draft_id: str,
) -> models.AIMarkingDraft:
    draft = _get_marking_draft(db, draft_id)
    submission = _get_submission(db, str(draft.submission_id))
    if can_access_submission(db, actor, submission):
        return draft
    raise _forbidden("You do not have access to this marking draft.")


def assert_can_access_appeal(
    db: Session,
    actor: Dict[str, Any],
    appeal_id: str,
) -> models.Appeal:
    appeal = _get_appeal(db, appeal_id)
    draft = _get_marking_draft(db, str(appeal.marking_id))
    submission = _get_submission(db, str(draft.submission_id))
    if can_access_submission(db, actor, submission):
        return appeal
    raise _forbidden("You do not have access to this appeal.")


def assert_can_run_workflow(
    actor: Dict[str, Any],
    workflow: str,
    submission_id: Optional[str] = None,
) -> None:
    role = actor.get("role")
    if role in {"Admin", "Teacher"}:
        return
    if submission_id:
        raise _forbidden("Only teachers and admins can run submission grading workflows.")
    if role in {"Student", "Parent"} and workflow in {"auto", "student_support", "daily_plan", "career_lens"}:
        return
    raise _forbidden("You do not have permission to run this workflow.")


def can_access_student(
    db: Session,
    actor: Dict[str, Any],
    student: models.StudentProfile,
) -> bool:
    role = actor.get("role")
    actor_id = actor.get("sub")

    if role == "Admin":
        return True
    if role == "Student":
        return str(student.user_id) == str(actor_id)
    if role == "Parent":
        return _parent_child_link_exists(db, actor_id, str(student.id))
    if role == "Teacher":
        return (
            db.query(models.Enrollment)
            .join(models.Unit, models.Unit.id == models.Enrollment.unit_id)
            .filter(models.Enrollment.student_id == student.id)
            .filter(models.Unit.teacher_id == _uuid(actor_id, "user_id"))
            .first()
            is not None
        )
    return False


def can_access_unit_id(db: Session, actor: Dict[str, Any], unit_id: str) -> bool:
    return can_access_unit(db, actor, _get_unit(db, unit_id))


def can_access_unit(
    db: Session,
    actor: Dict[str, Any],
    unit: models.Unit,
) -> bool:
    role = actor.get("role")
    actor_id = actor.get("sub")

    if role == "Admin":
        return True
    if role == "Teacher":
        return str(unit.teacher_id) == str(actor_id)
    if role == "Student":
        student = _get_student_by_user(db, actor_id)
        return _student_enrolled_in_unit(db, str(student.id), str(unit.id))
    if role == "Parent":
        parent = _get_parent_by_user(db, actor_id)
        if not parent:
            return False
        return (
            db.query(models.ParentChildLink)
            .join(models.Enrollment, models.Enrollment.student_id == models.ParentChildLink.student_id)
            .filter(models.ParentChildLink.parent_id == parent.id)
            .filter(models.Enrollment.unit_id == unit.id)
            .first()
            is not None
        )
    return False


def can_access_submission(
    db: Session,
    actor: Dict[str, Any],
    submission: models.Submission,
) -> bool:
    role = actor.get("role")
    actor_id = actor.get("sub")

    if role == "Admin":
        return True
    if role == "Student":
        student = _get_student_by_user(db, actor_id)
        return str(submission.student_id) == str(student.id)
    if role == "Parent":
        return _parent_child_link_exists(db, actor_id, str(submission.student_id))
    if role == "Teacher":
        assignment = _get_assignment(db, str(submission.assignment_id))
        return bool(assignment.unit_id and can_access_unit_id(db, actor, str(assignment.unit_id)))
    return False


def student_is_enrolled_for_assignment(
    db: Session,
    student_id: str,
    assignment_id: str,
) -> bool:
    assignment = _get_assignment(db, assignment_id)
    if not assignment.unit_id:
        return False
    return _student_enrolled_in_unit(db, student_id, str(assignment.unit_id))


def get_student_by_user(db: Session, user_id: str) -> models.StudentProfile:
    return _get_student_by_user(db, user_id)


def _get_student(db: Session, student_id: str) -> models.StudentProfile:
    student = (
        db.query(models.StudentProfile)
        .filter(models.StudentProfile.id == _uuid(student_id, "student_id"))
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    return student


def _get_student_by_user(db: Session, user_id: Optional[str]) -> models.StudentProfile:
    student = (
        db.query(models.StudentProfile)
        .filter(models.StudentProfile.user_id == _uuid(user_id, "user_id"))
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")
    return student


def _get_parent_by_user(db: Session, user_id: Optional[str]) -> Optional[models.ParentProfile]:
    if not user_id:
        return None
    return (
        db.query(models.ParentProfile)
        .filter(models.ParentProfile.user_id == _uuid(user_id, "user_id"))
        .first()
    )


def _get_unit(db: Session, unit_id: str) -> models.Unit:
    unit = db.query(models.Unit).filter(models.Unit.id == _uuid(unit_id, "unit_id")).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found.")
    return unit


def _get_assignment(db: Session, assignment_id: str) -> models.Assignment:
    assignment = (
        db.query(models.Assignment)
        .filter(models.Assignment.id == _uuid(assignment_id, "assignment_id"))
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    return assignment


def _get_submission(db: Session, submission_id: str) -> models.Submission:
    submission = (
        db.query(models.Submission)
        .filter(models.Submission.id == _uuid(submission_id, "submission_id"))
        .first()
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found.")
    return submission


def _get_marking_draft(db: Session, draft_id: str) -> models.AIMarkingDraft:
    draft = (
        db.query(models.AIMarkingDraft)
        .filter(models.AIMarkingDraft.id == _uuid(draft_id, "draft_id"))
        .first()
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Marking draft not found.")
    return draft


def _get_appeal(db: Session, appeal_id: str) -> models.Appeal:
    appeal = db.query(models.Appeal).filter(models.Appeal.id == _uuid(appeal_id, "appeal_id")).first()
    if not appeal:
        raise HTTPException(status_code=404, detail="Appeal not found.")
    return appeal


def _parent_child_link_exists(db: Session, parent_user_id: Optional[str], student_id: str) -> bool:
    parent = _get_parent_by_user(db, parent_user_id)
    if not parent:
        return False
    return (
        db.query(models.ParentChildLink)
        .filter(models.ParentChildLink.parent_id == parent.id)
        .filter(models.ParentChildLink.student_id == _uuid(student_id, "student_id"))
        .first()
        is not None
    )


def _student_enrolled_in_unit(db: Session, student_id: str, unit_id: str) -> bool:
    return (
        db.query(models.Enrollment)
        .filter(models.Enrollment.student_id == _uuid(student_id, "student_id"))
        .filter(models.Enrollment.unit_id == _uuid(unit_id, "unit_id"))
        .first()
        is not None
    )


def _uuid(value: Optional[str], field_name: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be a valid UUID.",
        )


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
