# backend/routers/insight_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict
import models, auth
import access
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
    if not parent:
        return []
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
    access.assert_can_access_student(db, payload, student_id)
    # Get all submissions for this student that have been marked
    query = db.query(models.Assignment, models.AIMarkingDraft).join(
        models.Submission, models.Submission.assignment_id == models.Assignment.id
    ).join(
        models.AIMarkingDraft, models.AIMarkingDraft.submission_id == models.Submission.id
    ).filter(models.Submission.student_id == student_id)
    if payload.get("role") == "Teacher":
        query = query.join(models.Unit, models.Unit.id == models.Assignment.unit_id).filter(
            models.Unit.teacher_id == payload.get("sub")
        )
    results = query.all()

    unit_grades = {}
    for assign, mark in results:
        unit_key = str(assign.unit_id)
        if unit_key not in unit_grades:
            unit_grades[unit_key] = {"total_weighted_score": 0.0, "total_weight": 0.0}
        
        if assign.is_weighted:
            unit_grades[unit_key]["total_weighted_score"] += (mark.initial_score * (assign.weight_percentage / 100))
            unit_grades[unit_key]["total_weight"] += assign.weight_percentage

    return unit_grades

# 3. GET /shadow-mentor/{sid} - Diagnosis & Patterns
@router.get("/shadow-mentor/{student_id}")
def get_shadow_mentor_analysis(student_id: str, db: Session = Depends(get_db), payload: dict = Depends(auth.decode_token)):
    if payload.get("role") == "Student" and student_id == payload.get("sub"):
        student = access.get_student_by_user(db, payload.get("sub"))
    else:
        student = access.assert_can_access_student(db, payload, student_id)
    
    return {
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


@router.get("/students/{student_id}/learning-profile")
def get_learning_profile(
    student_id: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.decode_token),
):
    student = access.assert_can_access_student(db, payload, student_id)
    user = db.query(models.User).filter(models.User.id == student.user_id).first()

    unit_query = (
        db.query(models.Unit)
        .join(models.Enrollment, models.Enrollment.unit_id == models.Unit.id)
        .filter(models.Enrollment.student_id == student.id)
    )
    if payload.get("role") == "Teacher":
        unit_query = unit_query.filter(models.Unit.teacher_id == payload.get("sub"))
    units = unit_query.all()
    unit_ids = [unit.id for unit in units]

    mark_query = (
        db.query(models.AIMarkingDraft, models.Submission, models.Assignment)
        .join(models.Submission, models.Submission.id == models.AIMarkingDraft.submission_id)
        .join(models.Assignment, models.Assignment.id == models.Submission.assignment_id)
        .filter(models.Submission.student_id == student.id)
    )
    if unit_ids:
        mark_query = mark_query.filter(models.Assignment.unit_id.in_(unit_ids))
    elif payload.get("role") == "Teacher":
        mark_query = mark_query.filter(False)
    recent_marks = mark_query.order_by(models.Submission.uploaded_at.desc()).limit(12).all()

    skill_query = (
        db.query(models.StudentSkillProgress, models.SkillNode)
        .join(models.SkillNode, models.SkillNode.id == models.StudentSkillProgress.node_id)
        .filter(models.StudentSkillProgress.student_id == student.id)
    )
    if unit_ids:
        skill_query = skill_query.filter(models.SkillNode.unit_id.in_(unit_ids))
    elif payload.get("role") == "Teacher":
        skill_query = skill_query.filter(False)
    skill_progress = skill_query.all()

    latest_plan = (
        db.query(models.DailyHomeworkPlan)
        .filter(models.DailyHomeworkPlan.student_id == student.id)
        .order_by(models.DailyHomeworkPlan.planned_for_date.desc())
        .first()
    )

    agent_runs = (
        db.query(models.AgentRun)
        .filter(models.AgentRun.student_id == student.id)
        .order_by(models.AgentRun.started_at.desc())
        .limit(10)
        .all()
    )
    agent_interactions = (
        db.query(models.AgentInteraction)
        .filter(models.AgentInteraction.student_id == student.id)
        .order_by(models.AgentInteraction.timestamp.desc())
        .limit(10)
        .all()
    )

    return {
        "student": {
            "id": str(student.id),
            "user_id": str(student.user_id),
            "full_name": user.full_name if user else "Unknown student",
            "career_goal": student.career_goal,
            "level": student.level,
            "total_xp": student.total_xp,
            "rank_title": student.rank_title,
            "career_pathway_data": student.career_pathway_data or {},
        },
        "units": [
            {
                "id": str(unit.id),
                "unit_name": unit.unit_name,
                "description": unit.description,
                "teacher_id": str(unit.teacher_id) if unit.teacher_id else None,
            }
            for unit in units
        ],
        "recent_marks": [
            {
                "draft_id": str(mark.id),
                "submission_id": str(submission.id),
                "assignment_id": str(assignment.id),
                "assignment_title": assignment.title,
                "score": mark.initial_score,
                "status": mark.status,
                "confidence_score": mark.confidence_score,
                "uploaded_at": submission.uploaded_at.isoformat() if submission.uploaded_at else None,
            }
            for mark, submission, assignment in recent_marks
        ],
        "skill_progress": [
            {
                "node_id": str(node.id),
                "node_name": node.node_name,
                "status": progress.status,
                "current_xp": progress.current_xp,
                "xp_to_unlock": node.xp_to_unlock,
            }
            for progress, node in skill_progress
        ],
        "latest_homework_plan": {
            "id": str(latest_plan.id),
            "homework_recipe": latest_plan.homework_recipe,
            "is_completed": latest_plan.is_completed,
            "planned_for_date": (
                latest_plan.planned_for_date.isoformat() if latest_plan.planned_for_date else None
            ),
        } if latest_plan else None,
        "shadow_mentor_summary": {
            "root_cause_diagnosis": student.root_cause_analysis,
            "mentor_notes": student.teacher_notes,
        },
        "recent_agent_runs": [
            {
                "id": str(run.id),
                "workflow": run.workflow,
                "actor_user_id": str(run.actor_user_id) if run.actor_user_id else None,
                "actor_role": run.actor_role,
                "selected_agents": run.selected_agents or [],
                "status": run.status,
                "persisted": run.persisted,
                "started_at": run.started_at.isoformat() if run.started_at else None,
                "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            }
            for run in agent_runs
        ],
        "recent_agent_interactions": [
            {
                "id": str(item.id),
                "agent_name": item.agent_name,
                "message_payload": item.message_payload,
                "timestamp": item.timestamp.isoformat() if item.timestamp else None,
            }
            for item in agent_interactions
        ],
    }
