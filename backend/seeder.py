# backend/seeder.py
import uuid
from datetime import datetime, timedelta
from database import SessionLocal
import models
import auth

def seed():
    db = SessionLocal()

    print("--- Phase 1: Cleaning Database ---")
    # Must delete in reverse order of dependencies (children first)
    tables = [
        models.DailyHomeworkPlan, models.AgentRun, models.AgentInteraction, models.Appeal,
        models.AIMarkingDraft, models.Submission, models.Assignment,
        models.StudentSkillProgress, models.SkillNode, models.Enrollment,
        models.Lecture, models.Announcement, models.Unit,
        models.ParentChildLink, models.ParentProfile, models.StudentProfile,
        models.TeacherProfile, models.User
    ]
    for table in tables:
        db.query(table).delete()
    db.commit()
    print("✅ Database cleared.")

    # --- Phase 2: Core Users ---
    hp = auth.hash_password("password123")
    users = [
        models.User(full_name="Munieb Admin", email="admin@corementor.com", hashed_password=hp, role="Admin"),
        models.User(full_name="Ms. Sarah Johnson", email="teacher@corementor.com", hashed_password=hp, role="Teacher"),
        models.User(full_name="Dr. Robert Wick", email="teacher2@corementor.com", hashed_password=hp, role="Teacher"),
        models.User(full_name="Ali Munieb", email="student@corementor.com", hashed_password=hp, role="Student"),
        models.User(full_name="Fatima Ahmed", email="fatima@student.com", hashed_password=hp, role="Student"),
        models.User(full_name="Omar Khalid", email="omar@student.com", hashed_password=hp, role="Student"),
        models.User(full_name="Mr. Ahmed", email="parent@corementor.com", hashed_password=hp, role="Parent")
    ]
    db.add_all(users)
    db.commit()

    # --- Phase 3: Profiles ---
    t_profs = [
        models.TeacherProfile(user_id=users[1].id, bio="Physics Expert", department="Science"),
        models.TeacherProfile(user_id=users[2].id, bio="Math Specialist", department="Mathematics")
    ]
    s_profs = [
        models.StudentProfile(user_id=users[3].id, career_goal="Aviation", level=5, total_xp=1500, rank_title="Flight Cadet",
                              career_pathway_data={"focus": "Propulsion", "milestones": ["Physics I", "Fluid Dynamics"]}),
        models.StudentProfile(user_id=users[4].id, career_goal="Doctor", level=2, total_xp=400, rank_title="Medical Intern",
                              career_pathway_data={"focus": "Biology", "milestones": ["Anatomy", "Chemistry"]}),
        models.StudentProfile(user_id=users[5].id, career_goal="Software Engineer", level=8, total_xp=3000, rank_title="Senior Dev",
                              career_pathway_data={"focus": "AI", "milestones": ["Algorithms", "Data Science"]})
    ]
    p_prof = models.ParentProfile(user_id=users[6].id)
    db.add_all(t_profs + s_profs + [p_prof])
    db.commit()

    # --- Phase 4: Parent-Child Links ---
    db.add_all([
        models.ParentChildLink(parent_id=p_prof.id, student_id=s_profs[0].id),
        models.ParentChildLink(parent_id=p_prof.id, student_id=s_profs[1].id),
        models.ParentChildLink(parent_id=p_prof.id, student_id=s_profs[2].id)
    ])

    # --- Phase 5: Units, Announcements & Lectures ---
    units = [
        models.Unit(unit_name="Physics 101", description="Basics of Motion", teacher_id=users[1].id),
        models.Unit(unit_name="Calculus II", description="Advanced integration", teacher_id=users[2].id),
        models.Unit(unit_name="Intro to AI", description="Neural network basics", teacher_id=users[2].id)
    ]
    db.add_all(units)
    db.commit()

    db.add_all([
        models.Announcement(unit_id=units[0].id, title="Welcome", content="Unit starts Monday!"),
        models.Announcement(unit_id=units[1].id, title="Lab Notice", content="Scientific calculators required."),
        models.Announcement(unit_id=units[2].id, title="GPU Access", content="Ollama credentials updated."),
        models.Lecture(unit_id=units[0].id, week_number=1, title="Gravity Basics", file_url="lectures/gravity.pdf"),
        models.Lecture(unit_id=units[0].id, week_number=2, title="Laws of Motion", file_url="lectures/laws.pdf"),
        models.Lecture(unit_id=units[1].id, week_number=1, title="Derivatives", file_url="lectures/calc.pdf")
    ])

    # --- Phase 6: Enrollments ---
    db.add_all([
        models.Enrollment(student_id=s_profs[0].id, unit_id=units[0].id),
        models.Enrollment(student_id=s_profs[1].id, unit_id=units[1].id),
        models.Enrollment(student_id=s_profs[2].id, unit_id=units[2].id)
    ])

    # --- Phase 7: Skill Tree ---
    math_node = models.SkillNode(unit_id=units[0].id, node_name="Mathematics")
    db.add(math_node)
    db.commit()

    physics_nodes = [
        models.SkillNode(unit_id=units[0].id, node_name="Algebra", parent_node_id=math_node.id),
        models.SkillNode(unit_id=units[0].id, node_name="Newtonian Physics", parent_node_id=math_node.id),
        models.SkillNode(unit_id=units[1].id, node_name="Integration")
    ]
    db.add_all(physics_nodes)
    db.commit()

    db.add_all([
        models.StudentSkillProgress(student_id=s_profs[0].id, node_id=math_node.id, status="Mastered", current_xp=100),
        models.StudentSkillProgress(student_id=s_profs[0].id, node_id=physics_nodes[0].id, status="In-Progress", current_xp=50),
        models.StudentSkillProgress(student_id=s_profs[2].id, node_id=physics_nodes[2].id, status="Locked", current_xp=0)
    ])

    # --- Phase 8: Assignments & Submissions ---
    assigns = [
        models.Assignment(unit_id=units[0].id, title="Motion Quiz", type="Quiz", is_weighted=True, weight_percentage=10.0, skill_node_id=math_node.id),
        models.Assignment(unit_id=units[1].id, title="Derivative HW", type="Homework", is_weighted=False),
        models.Assignment(unit_id=units[2].id, title="AI Essay", type="Assignment", is_weighted=True, weight_percentage=20.0)
    ]
    db.add_all(assigns)
    db.commit()

    subs = [
        models.Submission(student_id=s_profs[0].id, assignment_id=assigns[0].id, image_url="uploads/homework/motion.jpg"),
        models.Submission(student_id=s_profs[1].id, assignment_id=assigns[1].id, image_url="uploads/homework/calc.jpg"),
        models.Submission(student_id=s_profs[2].id, assignment_id=assigns[2].id, image_url="uploads/homework/ai.jpg")
    ]
    db.add_all(subs)
    db.commit()

    # --- Phase 9: AI Agents & Marking ---
    drafts = [
        models.AIMarkingDraft(submission_id=subs[0].id, initial_score=85.0, feedback_text="Great work!", confidence_score=0.98, agent_log="Found equations."),
        models.AIMarkingDraft(submission_id=subs[1].id, initial_score=72.0, feedback_text="Check sign.", confidence_score=0.88, agent_log="Arithmetic error."),
        models.AIMarkingDraft(submission_id=subs[2].id, initial_score=95.0, feedback_text="Flawless.", confidence_score=0.99, agent_log="Logical flow matched.")
    ]
    db.add_all(drafts)
    db.commit()

    db.add_all([
        models.Appeal(marking_id=drafts[0].id, title="Grade Issue", student_note="I used a different method."),
        models.Appeal(marking_id=drafts[1].id, title="Mistake correction", student_note="Second line is correct."),
        models.Appeal(marking_id=drafts[2].id, title="Feedback query", student_note="Why 95 and not 100?")
    ])

    # --- Phase 10: Interactions & Plans ---
    db.add_all([
        models.AgentInteraction(student_id=s_profs[0].id, agent_name="Shadow Mentor", message_payload={"status": "Focused"}),
        models.AgentInteraction(student_id=s_profs[1].id, agent_name="Grader", message_payload={"status": "Success"}),
        models.AgentInteraction(student_id=s_profs[2].id, agent_name="Orchestrator", message_payload={"status": "Active"})
    ])

    db.add_all([
        models.DailyHomeworkPlan(student_id=s_profs[0].id, planned_for_date=datetime.utcnow(), homework_recipe={"Physics": 30, "Aviation": 70}),
        models.DailyHomeworkPlan(student_id=s_profs[1].id, planned_for_date=datetime.utcnow(), homework_recipe={"Math": 50, "Bio": 50}),
        models.DailyHomeworkPlan(student_id=s_profs[2].id, planned_for_date=datetime.utcnow(), homework_recipe={"AI": 80, "Ethics": 20})
    ])

    db.commit()
    db.close()
    print("✅ All 16 tables populated with multiple rows successfully!")

if __name__ == "__main__":
    seed()
