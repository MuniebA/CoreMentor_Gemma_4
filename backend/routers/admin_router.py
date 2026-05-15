# backend/routers/admin_router.py
import os, shutil
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import models, auth
from agents.config import get_ai_settings
from database import SessionLocal

router = APIRouter(prefix="/admin", tags=["Admin Control Panel"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Pydantic Schemas ---
class UserUpdate(BaseModel):
    role: str
    full_name: str

class UnitCreateAdmin(BaseModel):
    unit_name: str
    teacher_id: str

class EnrollmentCreateAdmin(BaseModel):
    unit_id: str
    student_id: str

class ParentLinkCreateAdmin(BaseModel):
    parent_id: str
    student_id: str

# --- 1. User Management ---
@router.get("/users")
def list_system_users(db: Session = Depends(get_db), payload: dict = Depends(auth.require_role("Admin"))):
    users = db.query(models.User).all()
    # We also need to fetch specific profiles for the dropdowns in the UI
    teachers = db.query(models.User).filter(models.User.role == "Teacher").all()
    
    # Get students with their specific profile IDs
    students_data = []
    student_users = db.query(models.User).filter(models.User.role == "Student").all()
    for su in student_users:
        prof = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == su.id).first()
        if prof:
            students_data.append({"user_id": str(su.id), "profile_id": str(prof.id), "full_name": su.full_name})
            
    # Get parents with their specific profile IDs
    parents_data = []
    parent_users = db.query(models.User).filter(models.User.role == "Parent").all()
    for pu in parent_users:
        prof = db.query(models.ParentProfile).filter(models.ParentProfile.user_id == pu.id).first()
        if prof:
            parents_data.append({"user_id": str(pu.id), "profile_id": str(prof.id), "full_name": pu.full_name})

    return {
        "all_users": [{"id": str(u.id), "full_name": u.full_name, "email": u.email, "role": u.role} for u in users],
        "teachers": [{"id": str(t.id), "full_name": t.full_name} for t in teachers],
        "students": students_data,
        "parents": parents_data
    }

@router.put("/users/{user_id}")
def update_user_status(user_id: str, data: UserUpdate, db: Session = Depends(get_db), payload: dict = Depends(auth.require_role("Admin"))):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = data.role
    user.full_name = data.full_name
    db.commit()
    return {"message": "User updated successfully"}

# --- 2. Academic Operations (New Features!) ---
@router.get("/units")
def get_all_units(db: Session = Depends(get_db), payload: dict = Depends(auth.require_role("Admin"))):
    units = db.query(models.Unit).all()
    return [{"id": str(u.id), "unit_name": u.unit_name} for u in units]

@router.post("/units")
def create_unit_admin(data: UnitCreateAdmin, db: Session = Depends(get_db), payload: dict = Depends(auth.require_role("Admin"))):
    new_unit = models.Unit(unit_name=data.unit_name, teacher_id=data.teacher_id)
    db.add(new_unit)
    db.commit()
    return {"message": "Unit created successfully"}

@router.post("/enrollments")
def enroll_student_admin(data: EnrollmentCreateAdmin, db: Session = Depends(get_db), payload: dict = Depends(auth.require_role("Admin"))):
    # Check if already enrolled
    existing = db.query(models.Enrollment).filter(models.Enrollment.unit_id == data.unit_id, models.Enrollment.student_id == data.student_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Student is already enrolled in this unit")
        
    enrollment = models.Enrollment(unit_id=data.unit_id, student_id=data.student_id)
    db.add(enrollment)
    db.commit()
    return {"message": "Student enrolled successfully"}

@router.post("/parent-links")
def link_parent_admin(data: ParentLinkCreateAdmin, db: Session = Depends(get_db), payload: dict = Depends(auth.require_role("Admin"))):
    existing = db.query(models.ParentChildLink).filter(models.ParentChildLink.parent_id == data.parent_id, models.ParentChildLink.student_id == data.student_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Parent is already linked to this child")
        
    link = models.ParentChildLink(parent_id=data.parent_id, student_id=data.student_id)
    db.add(link)
    db.commit()
    return {"message": "Parent linked to child successfully"}

# --- 3. System Orchestration ---
@router.get("/system/status")
def get_system_health(payload: dict = Depends(auth.require_role("Admin"))):
    settings = get_ai_settings()
    return {
        "status": "Healthy",
        "gpu_lock": "Unlocked",
        "active_llm": settings.ollama_chat_model,
        "vision_engine": settings.ollama_vision_model,
        "vram_usage": "Not reported",
    }


def _purge_temp_files() -> dict:
    temp_dir = "./uploads/temp"
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
        os.makedirs(temp_dir)
        return {"message": "Temporary storage cleared."}
    return {"message": "Nothing to clear."}


# 4. Storage cleanup. POST keeps the older admin UI working; DELETE is the newer API.
@router.post("/cleanup")
def trigger_storage_cleanup(payload: dict = Depends(auth.require_role("Admin"))):
    return _purge_temp_files()


@router.delete("/cleanup")
def purge_temp_files(payload: dict = Depends(auth.require_role("Admin"))):
    return _purge_temp_files()
