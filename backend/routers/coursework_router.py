# backend/routers/coursework_router.py
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import models, auth, os, uuid
import access
from database import SessionLocal

router = APIRouter(prefix="/coursework", tags=["Coursework & Assignments"])

# Directory setup for uploads
UPLOAD_DIR = "./uploads"
os.makedirs(f"{UPLOAD_DIR}/homework", exist_ok=True)
os.makedirs(f"{UPLOAD_DIR}/answer_keys", exist_ok=True)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Pydantic Schemas ---
class AssignmentCreate(BaseModel):
    unit_id: str
    title: str
    type: str  # Homework, Quiz, Assignment, Exam
    due_date: datetime
    is_weighted: bool = False
    weight_percentage: float = 0.0
    skill_node_id: Optional[str] = None

class AssignmentResponse(BaseModel):
    id: str
    title: str
    type: str
    due_date: datetime
    is_weighted: bool
    weight_percentage: float
    
    class Config:
        from_attributes = True

# --- Endpoints ---

# 1. Create Coursework (Teacher Only)
@router.post("/create", response_model=AssignmentResponse)
def create_coursework(
    data: AssignmentCreate, 
    db: Session = Depends(get_db), 
    payload: dict = Depends(auth.require_role("Teacher"))
):
    unit = db.query(models.Unit).filter(
        models.Unit.id == data.unit_id, 
        models.Unit.teacher_id == payload.get("sub")
    ).first()
    
    if not unit:
        raise HTTPException(status_code=403, detail="Not authorized to add coursework to this unit")

    new_assignment = models.Assignment(
        unit_id=data.unit_id,
        title=data.title,
        type=data.type,
        due_date=data.due_date,
        is_weighted=data.is_weighted,
        weight_percentage=data.weight_percentage,
        skill_node_id=data.skill_node_id
    )
    db.add(new_assignment)
    db.commit()
    db.refresh(new_assignment)
    return new_assignment

# 2. Upload Answer Key (Teacher Only)
@router.post("/{assignment_id}/upload-key")
async def upload_answer_key(
    assignment_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher"))
):
    assignment = access.assert_can_access_assignment(db, payload, assignment_id)

    file_ext = file.filename.split(".")[-1]
    file_path = f"uploads/answer_keys/{uuid.uuid4()}.{file_ext}"
    
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
    
    assignment.answer_key_url = file_path
    db.commit()
    return {"message": "Answer key uploaded", "path": file_path}

# 3. Submit Homework (Student Only)
@router.post("/{assignment_id}/submit")
async def submit_homework(
    assignment_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Student"))
):
    student = access.get_student_by_user(db, payload.get("sub"))
    if not access.student_is_enrolled_for_assignment(db, str(student.id), assignment_id):
        raise HTTPException(status_code=403, detail="You are not enrolled in this assignment's unit")
    
    file_ext = file.filename.split(".")[-1]
    file_path = f"uploads/homework/{uuid.uuid4()}.{file_ext}"
    
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
    
    new_submission = models.Submission(
        student_id=student.id,
        assignment_id=assignment_id,
        image_url=file_path
    )
    db.add(new_submission)
    db.commit()
    return {"message": "Homework submitted successfully", "submission_id": new_submission.id}

# 4. Get all coursework for a specific unit
@router.get("/unit/{unit_id}", response_model=List[AssignmentResponse])
def get_unit_coursework(
    unit_id: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.decode_token),
):
    access.assert_can_access_unit(db, payload, unit_id)
    return db.query(models.Assignment).filter(models.Assignment.unit_id == unit_id).all()

# 5. Get Submission Details (Teacher/Admin View)
@router.get("/submission/{submission_id}")
def get_submission(
    submission_id: str, 
    db: Session = Depends(get_db), 
    payload: dict = Depends(auth.require_role("Teacher", "Admin"))
):
    submission = access.assert_can_access_submission(db, payload, submission_id)
    
    student_user = db.query(models.User).join(models.StudentProfile).filter(models.StudentProfile.id == submission.student_id).first()
    
    return {
        "submission": submission,
        "student_name": student_user.full_name
    }
