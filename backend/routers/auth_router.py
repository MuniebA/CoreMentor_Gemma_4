# backend/routers/auth_router.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import models
import auth
from database import SessionLocal

router = APIRouter(prefix="/auth", tags=["Auth"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Pydantic Schemas (what the API expects to receive) ---

class SignupRequest(BaseModel):
    full_name: str
    email: str
    password: str
    role: str  # Must be: Teacher, Student, or Parent

class LoginRequest(BaseModel):
    email: str
    password: str

# --- Endpoints ---

@router.post("/signup")
def signup(data: SignupRequest, db: Session = Depends(get_db)):
    if data.role not in ["Teacher", "Student", "Parent", "Admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    existing = db.query(models.User).filter(models.User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = models.User(
        full_name=data.full_name,
        email=data.email,
        hashed_password=auth.hash_password(data.password),
        role=data.role
    )
    db.add(new_user)
    db.flush() # Get user.id for profiles

    # --- NEW: Improved Profile Initialization ---
    if data.role == "Student":
        profile = models.StudentProfile(
            user_id=new_user.id,
            career_goal="Undecided", # Placeholder for Career Architect
            level=1,                 # Start at Level 1 for Gamification
            total_xp=0,
            rank_title="Novice",
            career_pathway_data={}    # Ready for Member 4's Vector data
        )
        db.add(profile)
    elif data.role == "Teacher":
        db.add(models.TeacherProfile(user_id=new_user.id))
    elif data.role == "Parent":
        db.add(models.ParentProfile(user_id=new_user.id))

    db.commit()
    return {"message": f"{data.role} account created successfully"}


@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    # Find the user
    user = db.query(models.User).filter(models.User.email == data.email).first()
    
    # Check password
    if not user or not auth.verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Create token with user info embedded
    token = auth.create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "full_name": user.full_name
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "full_name": user.full_name
    }


@router.get("/me")
def get_current_user(payload: dict = Depends(auth.decode_token)):
    """Returns the currently logged-in user's info from their token."""
    return {
        "user_id": payload.get("sub"),
        "email": payload.get("email"),
        "role": payload.get("role"),
        "full_name": payload.get("full_name")
    }