# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models
from routers import auth_router, upload_router, marking_router, unit_router, coursework_router, gamification_router, insight_router, admin_router

app = FastAPI(title="CoreMentor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(upload_router.router, prefix="/api/v1")
app.include_router(marking_router.router, prefix="/api/v1")
app.include_router(unit_router.router, prefix="/api/v1")
app.include_router(coursework_router.router, prefix="/api/v1")
app.include_router(gamification_router.router, prefix="/api/v1")
app.include_router(insight_router.router, prefix="/api/v1")
app.include_router(admin_router.router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {"status": "success", "message": "CoreMentor API is live!"}