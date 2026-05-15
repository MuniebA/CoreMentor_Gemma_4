# backend/routers/insight_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict
import models, auth
from database import SessionLocal

router = APIRouter(prefix="/insights", tags=["Insights & Shadow Mentor"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 1. GET /children (Parent Access)
@router.get("/children")
def get_my_children(db: Session = Depends(get_db), payload: dict = Depends(auth.require_role("Parent"))):
    parent = db.query(models.ParentProfile).filter(models.ParentProfile.user_id == payload.get("sub")).first()
    links = db.query(models.ParentChildLink).filter(models.ParentChildLink.parent_id == parent.id).all()
    
    children_data = []
    for link in links:
        student_prof = db.query(models.StudentProfile).filter(models.StudentProfile.id == link.student_id).first()
        user = db.query(models.User).filter(models.User.id == student_prof.user_id).first()
        children_data.append({
            "student_id": str(student_prof.id),
            "full_name": user.full_name,
            "level": student_prof.level,
            "rank": student_prof.rank_title
        })
    return children_data

# 2. GET /grades/{sid} - Weighted Grade Calculation
@router.get("/grades/{student_id}")
def get_student_grades(student_id: str, db: Session = Depends(get_db), payload: dict = Depends(auth.decode_token)):
    # Get all submissions for this student that have been marked
    results = db.query(models.Assignment, models.AIMarkingDraft).join(
        models.Submission, models.Submission.assignment_id == models.Assignment.id
    ).join(
        models.AIMarkingDraft, models.AIMarkingDraft.submission_id == models.Submission.id
    ).filter(models.Submission.student_id == student_id).all()

    unit_grades = {}
    for assign, mark in results:
        if assign.unit_id not in unit_grades:
            unit_grades[assign.unit_id] = {"total_weighted_score": 0.0, "total_weight": 0.0}
        
        if assign.is_weighted:
            unit_grades[assign.unit_id]["total_weighted_score"] += (mark.initial_score * (assign.weight_percentage / 100))
            unit_grades[assign.unit_id]["total_weight"] += assign.weight_percentage

    return unit_grades

# 3. GET /shadow-mentor/{sid} - Diagnosis & Patterns
@router.get("/shadow-mentor/{student_id}")
def get_shadow_mentor_analysis(student_id: str, db: Session = Depends(get_db), payload: dict = Depends(auth.decode_token)):
    student = db.query(models.StudentProfile).filter(models.StudentProfile.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    user = db.query(models.User).filter(models.User.id == student.user_id).first()
    
    return {
        "full_name": user.full_name,
        "level": student.level,
        "total_xp": student.total_xp,
        "rank_title": student.rank_title,
        "career_goal": student.career_goal,
        "root_cause_diagnosis": student.root_cause_analysis,
        "mentor_notes": student.teacher_notes,
        "ai_status": "Analyzing 3-month mistake patterns..."
    }

# 4. GET /hw-plan - Student's Daily Recipe
@router.get("/hw-plan")
def get_daily_homework_plan(db: Session = Depends(get_db), payload: dict = Depends(auth.require_role("Student"))):
    student = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == payload.get("sub")).first()
    plan = db.query(models.DailyHomeworkPlan).filter(
        models.DailyHomeworkPlan.student_id == student.id
    ).order_by(models.DailyHomeworkPlan.planned_for_date.desc()).first()
    
    if not plan:
        return {"message": "No plan generated yet. Complete more work for the AI to analyze."}
    return plan