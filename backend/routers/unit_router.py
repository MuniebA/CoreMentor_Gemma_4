# backend/routers/unit_router.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
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
    id: uuid.UUID  # FIX: Explicitly tell Pydantic to handle a UUID object
    unit_name: str
    description: Optional[str] = None  # FIX: Allow this to be null if missing in DB
    
    class Config:
        from_attributes = True

class UnitUpdate(BaseModel):
    description: str

class SyllabusTextUpdate(BaseModel):
    content: str

class LectureCreateUpdate(BaseModel):
    week_number: int
    title: str
    content_payload: list

class NoteUpdate(BaseModel):
    teacher_notes: str

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
        "syllabus_url": unit.syllabus_url,
        "syllabus_content": unit.syllabus_content,
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
def save_lecture(
    unit_id: str,
    data: LectureCreateUpdate,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher"))
):
    access.assert_can_access_unit(db, payload, unit_id)
    # Check if week already exists, if so, update it. If not, create it.
    lecture = db.query(models.Lecture).filter(
        models.Lecture.unit_id == unit_id, 
        models.Lecture.week_number == data.week_number
    ).first()

    if lecture:
        lecture.title = data.title
        lecture.content_payload = data.content_payload
    else:
        new_lecture = models.Lecture(
            unit_id=unit_id,
            week_number=data.week_number,
            title=data.title,
            content_payload=data.content_payload
        )
        db.add(new_lecture)
    db.commit()
    return {"message": "Lecture module saved successfully"}

# 6. Get All Lectures for a Unit
@router.get("/{unit_id}/lectures")
def get_lectures(
    unit_id: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.decode_token),
):
    access.assert_can_access_unit(db, payload, unit_id)
    return db.query(models.Lecture).filter(models.Lecture.unit_id == unit_id).order_by(models.Lecture.week_number).all()

# 7. Update Unit Details (Teacher Only)
@router.put("/{unit_id}")
def update_unit(
    unit_id: str,
    data: UnitUpdate,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher"))
):
    unit = access.assert_can_access_unit(db, payload, unit_id)
    
    unit.description = data.description
    db.commit()
    return {"message": "Unit updated successfully"}


# 8. Update Syllabus Text (Teacher Only)
@router.put("/{unit_id}/syllabus-content")
def update_syllabus_content(
    unit_id: str,
    data: SyllabusTextUpdate,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher"))
):
    unit = access.assert_can_access_unit(db, payload, unit_id)
    unit.syllabus_content = data.content
    db.commit()
    return {"message": "Syllabus content updated"}

@router.get("/{unit_id}/students")
def get_unit_students_and_grades(
    unit_id: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin")),
):
    access.assert_can_access_unit(db, payload, unit_id)
    enrollments = db.query(models.Enrollment).filter(models.Enrollment.unit_id == unit_id).all()
    assignments = db.query(models.Assignment).filter(
        models.Assignment.unit_id == unit_id, 
        models.Assignment.is_weighted == True
    ).all()

    roster = []
    for e in enrollments:
        student = db.query(models.StudentProfile).filter(models.StudentProfile.id == e.student_id).first()
        user = db.query(models.User).filter(models.User.id == student.user_id).first()

        grades = {}
        final_grade = 0.0

        # Calculate scores for this specific student
        for a in assignments:
            sub = db.query(models.Submission).filter(
                models.Submission.student_id == student.id, 
                models.Submission.assignment_id == a.id
            ).first()
            
            score = 0.0
            if sub:
                draft = db.query(models.AIMarkingDraft).filter(models.AIMarkingDraft.submission_id == sub.id).first()
                if draft and draft.initial_score:
                    score = draft.initial_score
                    
            grades[str(a.id)] = score
            final_grade += (score * (a.weight_percentage / 100.0))

        roster.append({
            "student_id": str(student.id),
            "full_name": user.full_name,
            "rank_title": student.rank_title,
            "total_xp": student.total_xp,
            "career_goal": student.career_goal,
            "teacher_notes": student.teacher_notes or "",
            "grades": grades,
            "final_grade": round(final_grade, 2)
        })

    return {
        "assignments": [{"id": str(a.id), "title": a.title, "weight": a.weight_percentage} for a in assignments],
        "students": roster
    }

@router.put("/student/{student_id}/notes")
def update_student_notes(
    student_id: str,
    data: NoteUpdate,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin")),
):
    student = access.assert_can_access_student(db, payload, student_id)
    student.teacher_notes = data.teacher_notes
    db.commit()
    return {"message": "Notes saved"}

# 9. Get Student's Coursework Status (Parents View)
@router.get("/student/{student_id}/enrolled")
def get_student_units(
    student_id: str, 
    db: Session = Depends(get_db), 
    payload: dict = Depends(auth.require_role("Parent", "Admin"))
):
    access.assert_can_access_student(db, payload, student_id)
    enrollments = db.query(models.Enrollment).filter(models.Enrollment.student_id == student_id).all()
    unit_ids = [e.unit_id for e in enrollments]
    units = db.query(models.Unit).filter(models.Unit.id.in_(unit_ids)).all()
    
    # Package it with the teacher's name for the UI
    results = []
    for u in units:
        teacher = db.query(models.User).filter(models.User.id == u.teacher_id).first()
        results.append({
            "id": str(u.id),
            "unit_name": u.unit_name,
            "description": u.description,
            "teacher_name": teacher.full_name if teacher else "Unknown"
        })
    return results
