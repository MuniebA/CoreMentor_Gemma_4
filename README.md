# 🚀 CoreMentor_Gemma_4

CoreMentor is an agentic educational ecosystem powered by **Gemma 2b** (local). It automates homework grading via Vision/OCR, analyzes learning patterns with a **Shadow Mentor**, and themes curriculum for a **Career Architect** experience.

## 🛠 Prerequisites

Before starting, ensure you have the following installed:

* **Python 3.10+**
* **Node.js LTS** (includes npm)
* **PostgreSQL 15+**
* **Ollama** (Download at [ollama.com](https://ollama.com))

---

## 🏗 Backend Setup (Python)

Navigate to the backend folder and set up your virtual environment.

```bash
cd backend
python -m venv venv
# Activate on Windows:
.\venv\Scripts\activate

```

### 1. Install Dependencies

We use specific versions to avoid the `bcrypt` and `jose` errors encountered during development.

```bash
# Core Dependencies
pip install fastapi uvicorn sqlalchemy psycopg2 python-dotenv Pillow python-multipart

# Security & Auth (CRITICAL: Bcrypt must be 4.3.0)
pip install "python-jose[cryptography]" passlib[bcrypt]
pip uninstall bcrypt -y
pip install bcrypt==4.3.0

# AI Dependencies
pip install ollama langchain-ollama langgraph

```

### 2. Environment Variables (`.env`)

Create a `.env` file in the **root** directory (not inside /backend):

```env
DB_USER=postgres
DB_PASSWORD=YourPostgresPassword
DB_HOST=localhost
DB_NAME=core_mentor_db
SECRET_KEY=your_super_secret_jwt_key

```

---

## 🐘 Database Setup (PostgreSQL)

1. Open **pgAdmin 4**.
2. Create a new database named `core_mentor_db`.
3. **Initialize Tables:** Start the backend once to let SQLAlchemy build the 17-table schema.
```bash
uvicorn main:app --reload

```


4. **Seed the Database:** Populate the system with Teachers, Students, Units, and Skill Nodes.
```bash
python seeder.py

```



---

## 🧠 AI Setup (Ollama)

Since we are working with consumer-grade hardware (e.g., MX250 GPUs), we use lightweight models:

1. Open your terminal and pull the models:
```bash
ollama pull gemma:2b
ollama pull moondream

```


2. Keep the Ollama application running in your system tray.

---

## 💻 Frontend Setup (Next.js)

In a new terminal window:

```bash
cd frontend
npm install
npm run dev

```

The app will be available at `http://localhost:3000`.

---

## 📂 Project Structure & API

The API is versioned under `/api/v1`. You can test all endpoints at `http://127.0.0.1:8000/docs`.

| Module | Router File | Purpose |
| --- | --- | --- |
| **Auth** | `auth_router.py` | Login/Signup & Profile Init |
| **Units** | `unit_router.py` | Syllabus, Announcements, Lectures |
| **Coursework** | `coursework_router.py` | Assignments & Grading Logic |
| **Uploads** | `upload_router.py` | File Hashing & Image Compression |
| **Gamification** | `gamification_router.py` | Skill Tree & XP Sync |
| **Insights** | `insight_router.py` | Shadow Mentor & Parent Feedback |
| **Admin** | `admin_router.py` | System Health & GPU Monitor |

---

## 🔑 Test Credentials

Use these accounts after running `seeder.py`:

* **Admin:** `admin@corementor.com` / `password123`
* **Teacher:** `teacher@corementor.com` / `password123`
* **Student:** `student@corementor.com` / `password123`

---

### **Team Tip: VS Code Extensions**

To work effectively, install:

* **Python** (Microsoft)
* **Thunder Client** (To test the API)
* **Tailwind CSS IntelliSense**
* **ESLint**
