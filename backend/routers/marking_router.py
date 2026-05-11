# backend/routers/marking_router.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import models
import auth
from database import SessionLocal

router = APIRouter(prefix="/marking", tags=["Marking & Appeals"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Pydantic Schemas ---

class MarkingDraftCreate(BaseModel):
    submission_id: str
    initial_score: float
    feedback_text: str
    agent_log: str

class AppealRequest(BaseModel):
    marking_id: str
    student_note: str

class MarkEditRequest(BaseModel):
    new_score: float
    feedback_text: str


# --- Teacher: Get all pending marks ---
@router.get("/pending")
def get_pending_marks(
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin"))
):
    """Returns all AI marking drafts that are waiting for teacher approval."""
    drafts = db.query(models.AIMarkingDraft).filter(
        models.AIMarkingDraft.status == "Pending"
    ).all()

    if not drafts:
        return {"message": "No pending marks", "data": []}

    results = []
    for draft in drafts:
        submission = db.query(models.Submission).filter(
            models.Submission.id == draft.submission_id
        ).first()
        results.append({
            "draft_id": str(draft.id),
            "submission_id": str(draft.submission_id),
            "student_id": str(submission.student_id) if submission else None,
            "initial_score": draft.initial_score,
            "feedback_text": draft.feedback_text,
            "agent_log": draft.agent_log,
            "status": draft.status
        })

    return {"message": f"{len(results)} pending marks found", "data": results}


# --- Teacher: Approve a mark ---
@router.patch("/{draft_id}/approve")
def approve_mark(
    draft_id: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin"))
):
    """Teacher approves the AI generated mark. Moves status from Pending to Approved."""
    draft = db.query(models.AIMarkingDraft).filter(
        models.AIMarkingDraft.id == draft_id
    ).first()

    if not draft:
        raise HTTPException(status_code=404, detail="Marking draft not found")

    if draft.status == "Approved":
        raise HTTPException(status_code=400, detail="This mark is already approved")

    draft.status = "Approved"
    db.commit()

    return {
        "message": "Mark approved successfully",
        "draft_id": draft_id,
        "new_status": "Approved"
    }


# --- Teacher: Edit and approve a mark ---
@router.patch("/{draft_id}/edit-and-approve")
def edit_and_approve_mark(
    draft_id: str,
    data: MarkEditRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin"))
):
    """Teacher edits the AI score and feedback before approving."""
    draft = db.query(models.AIMarkingDraft).filter(
        models.AIMarkingDraft.id == draft_id
    ).first()

    if not draft:
        raise HTTPException(status_code=404, detail="Marking draft not found")

    draft.initial_score = data.new_score
    draft.feedback_text = data.feedback_text
    draft.status = "Approved"
    db.commit()

    return {
        "message": "Mark edited and approved successfully",
        "draft_id": draft_id,
        "new_score": data.new_score,
        "new_status": "Approved"
    }


# --- Student: Get their own marks ---
@router.get("/my-marks")
def get_my_marks(
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.decode_token)
):
    """Student sees all their approved marks."""
    if payload.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can view their marks")

    user_id = payload.get("sub")
    student_profile = db.query(models.StudentProfile).filter(
        models.StudentProfile.user_id == user_id
    ).first()

    if not student_profile:
        raise HTTPException(status_code=404, detail="Student profile not found")

    # Get all submissions for this student
    submissions = db.query(models.Submission).filter(
        models.Submission.student_id == student_profile.id
    ).all()

    results = []
    for submission in submissions:
        draft = db.query(models.AIMarkingDraft).filter(
            models.AIMarkingDraft.submission_id == submission.id,
            models.AIMarkingDraft.status == "Approved"
        ).first()

        if draft:
            results.append({
                "draft_id": str(draft.id),
                "assignment_id": str(submission.assignment_id),
                "score": draft.initial_score,
                "feedback": draft.feedback_text,
                "status": draft.status
            })

    return {"message": f"{len(results)} approved marks found", "data": results}


# --- Student: Submit an appeal ---
@router.post("/appeal")
def submit_appeal(
    data: AppealRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.decode_token)
):
    """Student submits an appeal if they disagree with their mark."""
    if payload.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can submit appeals")

    # Check the mark exists and is approved before allowing appeal
    draft = db.query(models.AIMarkingDraft).filter(
        models.AIMarkingDraft.id == data.marking_id
    ).first()

    if not draft:
        raise HTTPException(status_code=404, detail="Mark not found")

    if draft.status != "Approved":
        raise HTTPException(
            status_code=400,
            detail="You can only appeal an approved mark. This mark is still pending."
        )

    # Check if appeal already exists
    existing_appeal = db.query(models.Appeal).filter(
        models.Appeal.marking_id == data.marking_id
    ).first()

    if existing_appeal:
        raise HTTPException(status_code=400, detail="You have already appealed this mark")

    appeal = models.Appeal(
        id=uuid.uuid4(),
        marking_id=data.marking_id,
        student_note=data.student_note
    )
    db.add(appeal)
    db.commit()
    db.refresh(appeal)

    return {
        "message": "Appeal submitted successfully",
        "appeal_id": str(appeal.id),
        "marking_id": data.marking_id
    }


# --- Teacher: Get all pending appeals ---
@router.get("/appeals/pending")
def get_pending_appeals(
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin"))
):
    """Returns all appeals waiting for teacher review. Powers the notification bell."""
    appeals = db.query(models.Appeal).all()

    if not appeals:
        return {"message": "No pending appeals", "count": 0, "data": []}

    results = []
    for appeal in appeals:
        draft = db.query(models.AIMarkingDraft).filter(
            models.AIMarkingDraft.id == appeal.marking_id
        ).first()
        results.append({
            "appeal_id": str(appeal.id),
            "marking_id": str(appeal.marking_id),
            "student_note": appeal.student_note,
            "current_score": draft.initial_score if draft else None,
            "agent_log": draft.agent_log if draft else None
        })

    return {
        "message": f"{len(results)} appeals found",
        "count": len(results),
        "data": results
    }


# --- Teacher: Resolve an appeal ---
@router.patch("/appeals/{appeal_id}/resolve")
def resolve_appeal(
    appeal_id: str,
    data: MarkEditRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin"))
):
    """Teacher reviews the appeal, sees the agent log, and makes a final decision."""
    appeal = db.query(models.Appeal).filter(
        models.Appeal.id == appeal_id
    ).first()

    if not appeal:
        raise HTTPException(status_code=404, detail="Appeal not found")

    # Update the mark with the teacher's final decision
    draft = db.query(models.AIMarkingDraft).filter(
        models.AIMarkingDraft.id == appeal.marking_id
    ).first()

    if not draft:
        raise HTTPException(status_code=404, detail="Original mark not found")

    draft.initial_score = data.new_score
    draft.feedback_text = data.feedback_text
    draft.status = "Approved"
    db.commit()

    return {
        "message": "Appeal resolved. Mark updated with final decision.",
        "appeal_id": appeal_id,
        "final_score": data.new_score
    }