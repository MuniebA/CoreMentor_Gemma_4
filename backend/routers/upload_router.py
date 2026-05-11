# backend/routers/upload_router.py
import os
import uuid
import hashlib
import io
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session
from PIL import Image
import models
import auth
from database import SessionLocal

router = APIRouter(prefix="/upload", tags=["Upload"])

# Directory setup for the 17-table architecture
UPLOAD_BASE = "./uploads"
DIRS = ["homework", "answer_keys", "syllabus", "lectures"]
for d in DIRS:
    os.makedirs(os.path.join(UPLOAD_BASE, d), exist_ok=True)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def hash_file(content: bytes) -> str:
    """Generate an MD5 hash of the file to detect duplicates."""
    return hashlib.md5(content).hexdigest()

# --- 1. Teacher: Upload Unit Syllabus ---
@router.post("/syllabus/{unit_id}")
async def upload_syllabus(
    unit_id: str, 
    file: UploadFile = File(...), 
    db: Session = Depends(get_db), 
    payload: dict = Depends(auth.require_role("Teacher", "Admin"))
):
    unit = db.query(models.Unit).filter(models.Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    content = await file.read()
    file_hash = hash_file(content)
    file_ext = file.filename.split(".")[-1]
    save_path = f"uploads/syllabus/{file_hash}.{file_ext}"

    if not os.path.exists(save_path):
        with open(save_path, "wb") as f:
            f.write(content)
    
    unit.syllabus_url = save_path
    db.commit()
    return {"message": "Syllabus uploaded", "file_path": save_path}

# --- 2. Teacher: Create Lecture & Upload Material ---
@router.post("/lecture/{unit_id}")
async def upload_lecture(
    unit_id: str,
    week: int,
    title: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin"))
):
    content = await file.read()
    file_hash = hash_file(content)
    file_ext = file.filename.split(".")[-1]
    save_path = f"uploads/lectures/{file_hash}.{file_ext}"

    if not os.path.exists(save_path):
        with open(save_path, "wb") as f:
            f.write(content)

    new_lecture = models.Lecture(
        unit_id=unit_id,
        week_number=week,
        title=title,
        file_url=save_path
    )
    db.add(new_lecture)
    db.commit()
    return {"message": "Lecture material uploaded", "lecture_id": str(new_lecture.id)}

# --- 3. Student: Upload Homework (With Compression) ---
@router.post("/homework/{assignment_id}")
async def upload_homework(
    assignment_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.decode_token)
):
    if payload.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can upload homework")

    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed for homework")

    content = await file.read()
    file_hash = hash_file(content)
    save_path = f"uploads/homework/{file_hash}.jpg"

    # Teammate's original compression logic
    if not os.path.exists(save_path):
        image = Image.open(io.BytesIO(content))
        image = image.convert("RGB")
        image.thumbnail((1920, 1920))
        image.save(save_path, "JPEG", quality=85)

    student = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == payload.get("sub")).first()
    
    new_submission = models.Submission(
        student_id=student.id,
        assignment_id=assignment_id,
        image_url=save_path
    )
    db.add(new_submission)
    db.commit()
    return {"message": "Homework submitted", "submission_id": str(new_submission.id)}

# --- 4. Teacher: Upload Answer Key ---
@router.post("/answer-key/{assignment_id}")
async def upload_answer_key(
    assignment_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(auth.require_role("Teacher", "Admin"))
):
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    content = await file.read()
    file_hash = hash_file(content)
    file_ext = file.filename.split(".")[-1]
    save_path = f"uploads/answer_keys/{file_hash}.{file_ext}"

    if not os.path.exists(save_path):
        with open(save_path, "wb") as f:
            f.write(content)

    assignment.answer_key_url = save_path
    db.commit()
    return {"message": "Answer key uploaded", "file_path": save_path}