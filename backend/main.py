# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine, Base
import models
from routers import auth_router, upload_router, marking_router, unit_router, coursework_router, gamification_router, insight_router, admin_router

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="CoreMentor API")

# --- IMPORTANT: CORS Setup so Next.js can talk to FastAPI ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://192.168.1.8:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory="./uploads"), name="uploads")

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
    return {"message": "CoreMentor API is running. Go to /docs for Swagger UI"}