# backend/routers/coursework_router.py
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import models, auth, os, uuid
from database import SessionLocal

router = APIRouter(prefix="/coursework", tags=["Coursework & Assignments"])

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
    quiz_payload: Optional[list] = [] # <-- Added this to accept the quiz JSON
    skill_node_id: Optional[str] = None

class AssignmentResponse(BaseModel):
    id: uuid.UUID
    title: str
    type: str
    due_date: Optional[datetime] = None
    is_weighted: bool
    weight_percentage: float
    
    class Config:
        from_attributes = True

class AssignmentUpdate(BaseModel):
    title: str
    due_date: datetime
    is_weighted: bool
    weight_percentage: float

class WeightUpdateItem(BaseModel):
    id: str
    weight_percentage: float

class BulkWeightUpdate(BaseModel):
    weights: List[WeightUpdateItem]

# --- Endpoints ---

# 1. Create Coursework (Teacher Only)
# FIX: Changed "/create" to "/" to fix the 404 Error!
@router.post("/", response_model=AssignmentResponse) 
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
        raise HTTPException(status_code=403, detail="Not authorized to add coursework")

    new_assignment = models.Assignment(
        unit_id=data.unit_id,
        title=data.title,
        type=data.type,
        due_date=data.due_date,
        is_weighted=data.is_weighted,
        weight_percentage=data.weight_percentage,
        quiz_payload=data.quiz_payload, # <-- Save the quiz questions
        skill_node_id=data.skill_node_id
    )
    db.add(new_assignment)
    db.commit()
    db.refresh(new_assignment)
    return new_assignment

# --- Edit Coursework ---
@router.put("/{assignment_id}")
def update_coursework(
    assignment_id: str, 
    data: AssignmentUpdate, 
    db: Session = Depends(get_db), 
    payload: dict = Depends(auth.require_role("Teacher"))
):
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Coursework not found")
    
    assignment.title = data.title
    assignment.due_date = data.due_date
    assignment.is_weighted = data.is_weighted
    assignment.weight_percentage = data.weight_percentage
    
    db.commit()
    return {"message": "Coursework updated successfully"}

# --- Delete Coursework ---
@router.delete("/{assignment_id}")
def delete_coursework(
    assignment_id: str, 
    db: Session = Depends(get_db), 
    payload: dict = Depends(auth.require_role("Teacher"))
):
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Coursework not found")
    
    db.delete(assignment)
    db.commit()
    return {"message": "Coursework deleted successfully"}

# 2. Upload Answer Key (Teacher Only)
@router.post("/{assignment_id}/upload-key")
async def upload_answer_key(
    assignment_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher"))
):
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

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
    student = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == payload.get("sub")).first()
    
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
def get_unit_coursework(unit_id: str, db: Session = Depends(get_db)):
    return db.query(models.Assignment).filter(models.Assignment.unit_id == unit_id).all()

# 5. Get Submission Details (Teacher/Admin View)
@router.get("/submission/{submission_id}")
def get_submission(
    submission_id: str, 
    db: Session = Depends(get_db), 
    payload: dict = Depends(auth.require_role("Teacher", "Admin"))
):
    submission = db.query(models.Submission).filter(models.Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    student_user = db.query(models.User).join(models.StudentProfile).filter(models.StudentProfile.id == submission.student_id).first()
    
    return {
        "submission": submission,
        "student_name": student_user.full_name
    }

@router.put("/unit/{unit_id}/weights")
def update_coursework_weights(
    unit_id: str, 
    data: BulkWeightUpdate, 
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher"))
):
    for w in data.weights:
        assignment = db.query(models.Assignment).filter(models.Assignment.id == w.id).first()
        if assignment:
            assignment.weight_percentage = w.weight_percentage
    db.commit()
    return {"message": "Weights updated successfully"}