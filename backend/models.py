# backend/models.py
import uuid
from sqlalchemy import Column, String, Boolean, Float, Text, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

# --- USER & IDENTITY ---
class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False) # Admin, Teacher, Student, Parent
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class TeacherProfile(Base):
    __tablename__ = "teacher_profiles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    bio = Column(Text)
    department = Column(String)

class StudentProfile(Base):
    __tablename__ = "student_profiles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    career_goal = Column(String)
    career_pathway_data = Column(JSONB)
    level = Column(Integer, default=1)
    total_xp = Column(Integer, default=0)
    rank_title = Column(String, default="Novice")
    teacher_notes = Column(Text)
    root_cause_analysis = Column(Text)

class ParentProfile(Base):
    __tablename__ = "parent_profiles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))

class ParentChildLink(Base):
    __tablename__ = "parent_child_links"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("parent_profiles.id"))
    student_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"))

# --- UNITS & KNOWLEDGE ---
class Unit(Base):
    __tablename__ = "units"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    unit_name = Column(String, nullable=False)
    description = Column(Text)
    syllabus_url = Column(String)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))

class Lecture(Base):
    __tablename__ = "lectures"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    unit_id = Column(UUID(as_uuid=True), ForeignKey("units.id"))
    week_number = Column(Integer)
    title = Column(String)
    file_url = Column(String)
    career_context_prompt = Column(Text)

class Announcement(Base):
    __tablename__ = "announcements"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    unit_id = Column(UUID(as_uuid=True), ForeignKey("units.id"))
    title = Column(String)
    content = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Enrollment(Base):
    __tablename__ = "enrollments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"))
    unit_id = Column(UUID(as_uuid=True), ForeignKey("units.id"))

# --- GAMIFICATION ---
class SkillNode(Base):
    __tablename__ = "skill_nodes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    unit_id = Column(UUID(as_uuid=True), ForeignKey("units.id"))
    node_name = Column(String)
    parent_node_id = Column(UUID(as_uuid=True), ForeignKey("skill_nodes.id"), nullable=True)
    xp_to_unlock = Column(Integer, default=100)

class StudentSkillProgress(Base):
    __tablename__ = "student_skill_progress"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"))
    node_id = Column(UUID(as_uuid=True), ForeignKey("skill_nodes.id"))
    status = Column(String) # Locked, In-Progress, Mastered
    current_xp = Column(Integer, default=0)

# --- COURSEWORK ---
class Assignment(Base):
    __tablename__ = "assignments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    unit_id = Column(UUID(as_uuid=True), ForeignKey("units.id"))
    title = Column(String)
    type = Column(String)
    due_date = Column(DateTime)
    is_weighted = Column(Boolean, default=False)
    weight_percentage = Column(Float, default=0.0)
    answer_key_url = Column(String)
    skill_node_id = Column(UUID(as_uuid=True), ForeignKey("skill_nodes.id"), nullable=True)

class Submission(Base):
    __tablename__ = "submissions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"))
    assignment_id = Column(UUID(as_uuid=True), ForeignKey("assignments.id"))
    image_url = Column(String)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

class AIMarkingDraft(Base):
    __tablename__ = "ai_marking_drafts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id = Column(UUID(as_uuid=True), ForeignKey("submissions.id"))
    initial_score = Column(Float)
    feedback_text = Column(Text)
    status = Column(String, default="Pending")
    agent_log = Column(Text)
    confidence_score = Column(Float)

class Appeal(Base):
    __tablename__ = "appeals"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    marking_id = Column(UUID(as_uuid=True), ForeignKey("ai_marking_drafts.id"))
    title = Column(String)
    student_note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# --- ORCHESTRATION ---
class AgentInteraction(Base):
    __tablename__ = "agent_interactions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"))
    agent_name = Column(String)
    message_payload = Column(JSONB)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class DailyHomeworkPlan(Base):
    __tablename__ = "daily_homework_plans"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"))
    homework_recipe = Column(JSONB)
    is_completed = Column(Boolean, default=False)
    planned_for_date = Column(DateTime(timezone=True))