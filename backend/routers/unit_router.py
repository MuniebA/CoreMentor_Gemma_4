# backend/routers/unit_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
import models, auth
import access
from database import SessionLocal

router = APIRouter(prefix="/units", tags=["Units & Content"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Pydantic Schemas ---
class AnnouncementCreate(BaseModel):
    title: str
    content: str

class UnitResponse(BaseModel):
    id: str
    unit_name: str
    description: str
    
    class Config:
        from_attributes = True

# --- Endpoints ---

# 1. Get all units for the logged-in user
@router.get("/", response_model=List[UnitResponse])
def get_my_units(db: Session = Depends(get_db), payload: dict = Depends(auth.decode_token)):
    user_id = payload.get("sub")
    role = payload.get("role")
    
    if role == "Teacher":
        return db.query(models.Unit).filter(models.Unit.teacher_id == user_id).all()
    
    elif role == "Student":
        student = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == user_id).first()
        enrollments = db.query(models.Enrollment).filter(models.Enrollment.student_id == student.id).all()
        unit_ids = [e.unit_id for e in enrollments]
        return db.query(models.Unit).filter(models.Unit.id.in_(unit_ids)).all()

# 2. Post an Announcement (Teacher Only)
@router.post("/{unit_id}/announcements")
def create_announcement(
    unit_id: str, 
    data: AnnouncementCreate, 
    db: Session = Depends(get_db), 
    payload: dict = Depends(auth.require_role("Teacher"))
):
    unit = access.assert_can_access_unit(db, payload, unit_id)
        
    new_announcement = models.Announcement(
        unit_id=unit_id,
        title=data.title,
        content=data.content
    )
    db.add(new_announcement)
    db.commit()
    return {"message": "Announcement posted successfully"}

# 3. Get Unit Home Page details
@router.get("/{unit_id}/home")
def get_unit_home(unit_id: str, db: Session = Depends(get_db), payload: dict = Depends(auth.decode_token)):
    unit = access.assert_can_access_unit(db, payload, unit_id)
    teacher = db.query(models.User).filter(models.User.id == unit.teacher_id).first()
    announcements = db.query(models.Announcement).filter(models.Announcement.unit_id == unit_id).all()
    
    return {
        "unit_name": unit.unit_name,
        "description": unit.description,
        "teacher_name": teacher.full_name,
        "announcements": announcements
    }

# 4. Upload Syllabus (Teacher Only)
@router.post("/{unit_id}/syllabus")
async def upload_syllabus(
    unit_id: str, 
    syllabus_url: str, # For now, we pass the URL from the upload_router
    db: Session = Depends(get_db), 
    payload: dict = Depends(auth.require_role("Teacher"))
):
    unit = access.assert_can_access_unit(db, payload, unit_id)
    unit.syllabus_url = syllabus_url
    db.commit()
    return {"message": "Syllabus updated successfully"}

# 5. Create Lecture Module (Teacher Only)
@router.post("/{unit_id}/lectures")
def create_lecture(
    unit_id: str,
    week: int,
    title: str,
    file_url: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher"))
):
    access.assert_can_access_unit(db, payload, unit_id)
    new_lecture = models.Lecture(
        unit_id=unit_id,
        week_number=week,
        title=title,
        file_url=file_url
    )
    db.add(new_lecture)
    db.commit()
    return {"message": "Lecture module created"}

# 6. Get All Lectures for a Unit
@router.get("/{unit_id}/lectures")
def get_lectures(
    unit_id: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.decode_token),
):
    access.assert_can_access_unit(db, payload, unit_id)
    return db.query(models.Lecture).filter(models.Lecture.unit_id == unit_id).order_by(models.Lecture.week_number).all()
