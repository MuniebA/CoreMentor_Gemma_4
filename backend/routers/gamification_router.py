# backend/routers/gamification_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict
import models, auth
import access
from database import SessionLocal

router = APIRouter(prefix="/gamification", tags=["Gamification & Career"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Pydantic Schemas ---
class SkillNodeStatus(BaseModel):
    id: str
    node_name: str
    parent_node_id: Optional[str]
    status: str  # Locked, In-Progress, Mastered
    xp_to_unlock: int
    model_config = ConfigDict(from_attributes=True)

class CareerLensResponse(BaseModel):
    original_title: str
    themed_title: str
    themed_instructions: str
    career_context: str

# --- Endpoints ---

# 1. GET /skill-tree/{unit_id} - Full Hierarchy for SVG UI
@router.get("/skill-tree/{unit_id}", response_model=List[SkillNodeStatus])
def get_unit_skill_tree(unit_id: str, db: Session = Depends(get_db), payload: dict = Depends(auth.decode_token)):
    access.assert_can_access_unit(db, payload, unit_id)
    student = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == payload.get("sub")).first()
    if not student:
        raise HTTPException(status_code=403, detail="Only students can view their skill progress")
    nodes = db.query(models.SkillNode).filter(models.SkillNode.unit_id == unit_id).all()
    
    results = []
    for node in nodes:
        progress = db.query(models.StudentSkillProgress).filter(
            models.StudentSkillProgress.student_id == student.id,
            models.StudentSkillProgress.node_id == node.id
        ).first()
        
        results.append({
            "id": str(node.id),
            "node_name": node.node_name,
            "parent_node_id": str(node.parent_node_id) if node.parent_node_id else None,
            "status": progress.status if progress else "Locked",
            "xp_to_unlock": node.xp_to_unlock
        })
    return results

# 2. POST /skill-tree/unlock/{node_id} - Logic to "Buy" a node
@router.post("/skill-tree/unlock/{node_id}")
def unlock_skill_node(node_id: str, db: Session = Depends(get_db), payload: dict = Depends(auth.decode_token)):
    if payload.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can unlock their own skills")
    student = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == payload.get("sub")).first()
    node = db.query(models.SkillNode).filter(models.SkillNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Skill node not found")
    access.assert_can_access_unit(db, payload, str(node.unit_id))
    
    if student.total_xp < node.xp_to_unlock:
        raise HTTPException(status_code=400, detail="Not enough XP to unlock this skill.")

    # Update or Create progress
    progress = db.query(models.StudentSkillProgress).filter(
        models.StudentSkillProgress.student_id == student.id,
        models.StudentSkillProgress.node_id == node.id
    ).first()

    if not progress:
        progress = models.StudentSkillProgress(student_id=student.id, node_id=node.id, status="In-Progress")
        db.add(progress)
    
    student.total_xp -= node.xp_to_unlock # Deduct "currency"
    db.commit()
    return {"message": f"Skill '{node.node_name}' is now In-Progress!"}

# 3. GET /career/roadmap - The milestones for Parent & Student
@router.get("/career/roadmap")
def get_career_roadmap(db: Session = Depends(get_db), payload: dict = Depends(auth.decode_token)):
    if payload.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can view their own career roadmap")
    student = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == payload.get("sub")).first()
    return {
        "career_goal": student.career_goal,
        "rank": student.rank_title,
        "milestones": student.career_pathway_data # JSON from seeder/AI
    }

# 4. GET /career/lens/{assignment_id} - The Career Architect logic
@router.get("/career/lens/{assignment_id}", response_model=CareerLensResponse)
def get_career_themed_assignment(assignment_id: str, db: Session = Depends(get_db), payload: dict = Depends(auth.decode_token)):
    if payload.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can view their own career lens")
    student = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == payload.get("sub")).first()
    assignment = access.assert_can_access_assignment(db, payload, assignment_id)
    
    # In a real run, Member 4's Career Architect Agent would generate this.
    # For now, we provide the structured data placeholder.
    return {
        "original_title": assignment.title,
        "themed_title": f"{assignment.title} (For {student.career_goal}s)",
        "themed_instructions": f"As a future {student.career_goal}, solve this using your professional tools...",
        "career_context": f"This task helps you master {student.career_goal} basics."
    }

# 5. POST /xp/award - Internal Sync (Calculates Rank automatically)
@router.post("/xp/award", include_in_schema=False)
def sync_student_xp(
    student_id: str,
    amount: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin")),
):
    access.assert_can_access_student(db, payload, student_id)
    student = db.query(models.StudentProfile).filter(models.StudentProfile.id == student_id).first()
    student.total_xp += amount
    
    # Automatic Rank Logic
    if student.total_xp > 5000: student.rank_title = "Grandmaster"
    elif student.total_xp > 2000: student.rank_title = "Expert"
    elif student.total_xp > 1000: student.rank_title = "Apprentice"
    
    db.commit()
    return {"new_total": student.total_xp, "rank": student.rank_title}

# 6. GET /leaderboard/{unit_id} - Competition logic
@router.get("/leaderboard/{unit_id}")
def get_unit_leaderboard(
    unit_id: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.decode_token),
):
    access.assert_can_access_unit(db, payload, unit_id)
    top_students = db.query(models.StudentProfile).join(models.Enrollment).filter(
        models.Enrollment.unit_id == unit_id
    ).order_by(models.StudentProfile.total_xp.desc()).limit(10).all()
    
    return [{"name": db.query(models.User).filter(models.User.id == s.user_id).first().full_name, "xp": s.total_xp} for s in top_students]

# 7. GET /student/stats - High-level summary
@router.get("/student/stats")
def get_student_stats(db: Session = Depends(get_db), payload: dict = Depends(auth.decode_token)):
    if payload.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can view their own stats")
    student = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == payload.get("sub")).first()
    return {
        "level": student.level,
        "xp": student.total_xp,
        "rank": student.rank_title,
        "next_level": (student.level + 1) * 1000
    }
