# backend/routers/admin_router.py
import os, shutil
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import models, auth
from database import SessionLocal

router = APIRouter(prefix="/admin", tags=["Admin Control Panel"])

class UserUpdate(BaseModel):
    role: str
    full_name: str

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 1. GET /users - User Management List
@router.get("/users")
def list_system_users(db: Session = Depends(get_db), payload: dict = Depends(auth.require_role("Admin"))):
    return db.query(models.User).all()

# 2. PUT /users/{id} - Modify Role or Info
@router.put("/users/{user_id}")
def update_user_status(user_id: str, data: UserUpdate, db: Session = Depends(get_db), payload: dict = Depends(auth.require_role("Admin"))):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.role = data.role
    user.full_name = data.full_name
    db.commit()
    return {"message": "User updated successfully"}

# 3. GET /system/status - GPU & Mutex Monitor
@router.get("/system/status")
def get_gpu_health(payload: dict = Depends(auth.require_role("Admin"))):
    # Logic for Member 4's Performance Monitor
    return {
        "status": "Healthy",
        "gpu_lock": "Unlocked",
        "active_llm": "Gemma-2b",
        "vision_engine": "Moondream"
    }

# 4. DELETE /cleanup - Temporary File Purge
@router.delete("/cleanup")
def purge_temp_files(payload: dict = Depends(auth.require_role("Admin"))):
    temp_dir = "./uploads/temp"
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
        os.makedirs(temp_dir)
        return {"message": "Temporary storage cleared."}
    return {"message": "Nothing to clear."}