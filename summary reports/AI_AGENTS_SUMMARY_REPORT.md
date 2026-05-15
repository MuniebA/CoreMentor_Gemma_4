# CoreMentor AI Agents Summary Report

Date reviewed: 2026-05-13

## 1. Executive Summary

CoreMentor currently has a real local agent orchestration layer under `backend/agents/`. It is not just a chatbot wrapper. The system is built around a LangGraph mesh coordinated by a `MeshCoordinator`, exposed through FastAPI at:

```text
POST /api/v1/orchestration/run
GET  /api/v1/orchestration/health
POST /api/v1/orchestration/chroma/init
GET  /api/v1/orchestration/audit/{student_id}
```

The active agent flow is:

```text
intake
  -> grader
  -> teacher_review_gate
  -> shadow_mentor
  -> load_balancer
  -> career_architect
  -> persist_outputs
  -> finalize
```

The system has deterministic fallback logic, so agent workflows can still return structured output when Ollama, ChromaDB, or Docling are missing. When local AI services are available, the deterministic artifacts are enriched through Ollama, ChromaDB, and Docling.

## 2. Main Agent Parts

| Part | File | Current role |
| --- | --- | --- |
| Mesh Coordinator | `backend/agents/coordinator.py` | Runs one orchestration workflow at a time using a process-level lock. |
| LangGraph graph | `backend/agents/graph.py` | Defines graph nodes, routing, selected agents, and final run state. |
| Agent skills | `backend/agents/corementor_skills.py` | Contains the actual behavior for grader, mentor, homework plan, career lens, and gamification recommendation. |
| Runtime adapters | `backend/agents/runtime.py` | Connects optional local Ollama, ChromaDB, and Docling services. |
| Data repository | `backend/agents/repository.py` | Loads SQL context and persists agent outputs back to PostgreSQL. |
| API router | `backend/routers/orchestration_router.py` | Exposes run, health, Chroma init, and audit endpoints. |
| Request/response schema | `backend/agents/schemas.py` | Defines valid workflows and request fields. |

## 3. What Each Agent Does

### Mesh Coordinator

Location:

```text
backend/agents/coordinator.py
backend/agents/graph.py
```

Purpose:

- Accepts an orchestration request.
- Loads student, assignment, submission, marks, skill progress, and open assignment context.
- Selects which agents should run.
- Prevents overlapping local inference with a single lock.
- Returns artifacts, persistence details, audit log, and errors.

Current important behavior:

- Uses `threading.Lock`, so only one local workflow can run at a time in this Python process.
- Returns HTTP `409` if another run is active.
- Does not itself grade or mentor; it delegates to graph nodes.

### The Grader

Location:

```text
backend/agents/corementor_skills.py
build_marking_draft()
```

Purpose:

- Creates a provisional homework marking draft.
- Checks whether submission file and answer key are available.
- Produces:
  - `initial_score`
  - `confidence_score`
  - `mistake_patterns`
  - `feedback_text`
  - `agent_log`
  - `status`

Current state:

- Uses deterministic scoring first.
- If Docling is available, it tries to parse uploaded submission text.
- If Ollama is available, it asks the local chat model to refine the JSON artifact.
- By default, output stays `Pending` for teacher review.

Persists to:

```text
ai_marking_drafts
```

Change here if you want:

- grading rules
- confidence-score logic
- feedback wording
- mistake-pattern extraction
- grader prompt
- whether drafts default to `Pending` or `Approved`

### Teacher Review Gate

Location:

```text
backend/agents/graph.py
_teacher_review_gate_node()
```

Purpose:

- Keeps the teacher as final authority.
- Records whether the grader output requires human review.

Current state:

- If the grader artifact status is `Pending`, `requires_teacher_review` is true.
- This is an artifact in the orchestration response, not a separate database table.

Change here if you want:

- automated approval policy
- different human-review messaging
- conditions for skipping teacher review

### The Shadow Mentor

Location:

```text
backend/agents/corementor_skills.py
build_shadow_mentor_profile()
```

Purpose:

- Diagnoses long-term learning patterns.
- Looks at recent marks, skill progress, latest grader mistake patterns, and Chroma student memory.
- Produces:
  - `average_score`
  - `patterns`
  - `memory_hits`
  - `priority_subjects`
  - `root_cause_diagnosis`
  - `mentor_notes`

Current state:

- Uses deterministic diagnosis first.
- If ChromaDB is available, searches `student_patterns`.
- Saves new patterns back into vector memory.
- If Ollama is available, asks the local model to refine the diagnosis JSON.

Persists to:

```text
student_profiles.root_cause_analysis
student_profiles.teacher_notes
agent_interactions
```

Change here if you want:

- support thresholds, for example average score below 75
- diagnosis text
- mentor-note style
- priority subject rules
- Shadow Mentor prompt

### The Load Balancer

Location:

```text
backend/agents/corementor_skills.py
build_homework_plan()
```

Purpose:

- Builds a daily homework recipe from student weaknesses and open assignments.
- Produces review, deep-work, and career-link blocks.

Current state:

- Default plan is 60 minutes:
  - 15 minutes review
  - 35 minutes deep work
  - 10 minutes career link
- If Ollama is available, it can refine the plan while preserving the computed time budget.

Persists to:

```text
daily_homework_plans
agent_interactions
```

Change here if you want:

- time allocation
- homework block names
- workload policy
- completion signal
- Load Balancer prompt

### The Career Architect

Location:

```text
backend/agents/corementor_skills.py
build_career_lens()
```

Purpose:

- Rewrites assignments through the student's career goal.
- Uses assignment, unit, student career goal, and Chroma career examples.

Current output:

- `original_title`
- `themed_title`
- `career_context`
- `themed_instructions`
- `career_examples`

Current state:

- Uses deterministic rewrite first.
- Searches Chroma `career_data` if available.
- Uses Ollama to refine JSON if available.

Persists to:

```text
agent_interactions
```

Important note:

- The orchestration Career Architect is in `backend/agents/corementor_skills.py`.
- There is also a simpler placeholder career-lens endpoint in `backend/routers/gamification_router.py` at `GET /api/v1/gamification/career/lens/{assignment_id}`. That endpoint does not use the LangGraph agent path.

Change here if you want:

- career-rewrite format
- examples retrieved from ChromaDB
- prompt wording
- output fields displayed in the UI

### Gamification Coach

Location:

```text
backend/agents/corementor_skills.py
build_gamification_recommendation()
```

Purpose:

- Recommends XP awards and rank movement.

Current state:

- It is not a main selected workflow agent.
- It is generated alongside Career Architect inside `_career_architect_node()`.
- It does not directly mutate the student's XP balance.

Change here if you want:

- XP formula
- rank recommendation policy
- when XP should be awarded

## 4. Workflow Selection

Configured in:

```text
backend/agents/graph.py
_select_agents()
```

Current workflow behavior:

| Workflow | Selected agents |
| --- | --- |
| `grade_submission` | grader, shadow_mentor, load_balancer, career_architect |
| `student_support` | shadow_mentor, load_balancer, career_architect |
| `daily_plan` | shadow_mentor, load_balancer, career_architect |
| `career_lens` | career_architect |
| `auto` with `submission_id` | grader, shadow_mentor, load_balancer, career_architect |
| `auto` with `assignment_id` only | career_architect |
| `auto` default | shadow_mentor, load_balancer, career_architect |

Request schema is defined in:

```text
backend/agents/schemas.py
```

Important request fields:

```text
workflow
student_id
assignment_id
submission_id
persist
teacher_review_required
notes
```

## 5. Data Flow

1. Frontend or API client calls `POST /api/v1/orchestration/run`.
2. `orchestration_router.py` authenticates the user with `auth.decode_token`.
3. `MeshCoordinator` starts a locked run.
4. `OrchestrationRepository.load_context()` loads student, submission, assignment, unit, marks, skill progress, and open assignment data.
5. `graph.py` routes through selected agent nodes.
6. `corementor_skills.py` creates deterministic artifacts.
7. `runtime.py` optionally enriches those artifacts with:
   - Ollama chat model
   - Ollama embeddings
   - ChromaDB vector memory
   - Docling document parsing
8. `repository.py` persists outputs if `persist=true`.
9. API returns run details, artifacts, persistence info, audit log, and errors.

## 6. Persistence and Audit Tables

Agent outputs currently use existing tables in `backend/models.py`:

| Table/model | Used for |
| --- | --- |
| `AIMarkingDraft` / `ai_marking_drafts` | Pending grader drafts and feedback. |
| `StudentProfile` / `student_profiles` | Shadow Mentor root-cause diagnosis and teacher notes. |
| `DailyHomeworkPlan` / `daily_homework_plans` | Load Balancer daily plan artifact. |
| `AgentInteraction` / `agent_interactions` | Mesh Coordinator and per-agent audit records. |
| Chroma `student_patterns` | Semantic memory for student mistake patterns. |
| Chroma `career_data` | Career examples for the Career Architect. |

Audit can be viewed through:

```text
GET /api/v1/orchestration/audit/{student_id}
```

## 7. Runtime Configuration

Primary config file:

```text
backend/agents/config.py
```

Environment example:

```text
.env.example
backend/agents/README.md
```

Current AI-related knobs:

| Env var | Purpose | Code default |
| --- | --- | --- |
| `COREMENTOR_AGENT_MODE` | Agent mode label returned in health. | `hybrid` |
| `COREMENTOR_LLM_ENABLED` | Enables or disables Ollama chat calls. | `true` |
| `COREMENTOR_CHROMA_ENABLED` | Enables or disables Chroma/vector memory. | `true` |
| `COREMENTOR_DOCLING_ENABLED` | Enables or disables Docling file parsing. | `true` |
| `OLLAMA_BASE_URL` | Ollama server URL. | `http://localhost:11434` |
| `COREMENTOR_OLLAMA_MODEL` | Chat model used by `ChatOllama`. | `gemma4:4b` |
| `COREMENTOR_OLLAMA_EMBED_MODEL` | Embedding model used by `OllamaEmbeddings`. | `nomic-embed-text` |
| `COREMENTOR_OLLAMA_TEMPERATURE` | Chat model temperature. | `0.2` |
| `COREMENTOR_OLLAMA_NUM_CTX` | Context window passed to Ollama. | `4096` |
| `COREMENTOR_OLLAMA_KEEP_ALIVE` | Ollama keep-alive value. | `10m` |
| `CHROMA_PERSIST_DIR` | Persistent ChromaDB path. | `backend/storage/chroma` |
| `CHROMA_STUDENT_PATTERNS_COLLECTION` | Student pattern collection. | `student_patterns` |
| `CHROMA_CAREER_DATA_COLLECTION` | Career example collection. | `career_data` |
| `COREMENTOR_UPLOADS_DIR` | Local uploads path used by Docling. | `backend/uploads` |

Important discrepancy:

- `backend/agents/config.py` defaults to `COREMENTOR_OLLAMA_MODEL=gemma4:4b`.
- `backend/agents/README.md` also documents `gemma4:4b`.
- `.env.example` currently says `COREMENTOR_OLLAMA_MODEL=gemma4:e4b`.

Anyone setting up the project should confirm which Ollama model tag actually exists locally with:

```bash
ollama list
```

Then set `COREMENTOR_OLLAMA_MODEL` in `.env` accordingly.

## 8. UI Surfaces

### Teacher Dashboard

Location:

```text
frontend/app/dashboard/teacher/page.tsx
```

Current agent UI:

- Has an `Agent Orchestration` tab.
- Lets teacher select a submission.
- Can run:
  - Grade Submission
  - Student Support
  - Daily Plan
  - Career Lens
- Displays per-agent artifact cards.
- Displays audit log.
- Displays persisted data from `agent_interactions`, `daily_homework_plans`, and `ai_marking_drafts`.

### Admin Dashboard

Location:

```text
frontend/app/dashboard/admin/page.tsx
```

Current agent UI:

- Has an `Agent Health` tab.
- Calls `GET /api/v1/orchestration/health`.
- Shows graph pipeline, adapter status, Ollama config, and Chroma config.
- Has an `Init ChromaDB` button calling `POST /api/v1/orchestration/chroma/init`.

### Student Dashboard

Location:

```text
frontend/app/dashboard/student/page.tsx
```

Current agent-related views:

- `Daily Quest` displays latest Load Balancer homework plan.
- `Shadow Mentor` displays root-cause analysis and mentor notes.
- `Career Lens` uses the simpler gamification endpoint, not the orchestration endpoint.
- `My Marks` displays approved marks after teacher review.

### Parent Dashboard

Location:

```text
frontend/app/dashboard/parent/page.tsx
```

Current agent-related views:

- Shows Shadow Mentor summary for selected child.
- Shows weighted grades.
- Does not directly run orchestration.

## 9. Setup and Operational Commands

Install backend agent dependencies:

```bash
cd /home/rafid/file-sys/CoreMentor_Gemma_4
source core/bin/activate
pip install -r backend/requirements.txt
```

Pull local Ollama models, adjusting the chat model name if needed:

```bash
ollama pull gemma4:4b
ollama pull nomic-embed-text
```

Initialize ChromaDB:

```bash
python backend/scripts/init_chroma.py
```

Alternative Chroma init through API:

```text
POST /api/v1/orchestration/chroma/init
```

Check runtime health:

```text
GET /api/v1/orchestration/health
```

## 10. Known Current Limitations

1. The system is hybrid/fallback-first. It can return deterministic artifacts without true LLM reasoning if Ollama is unavailable.
2. The Grader is not yet a fully defensible OCR/vision grader. It scores from available evidence and optional Docling text extraction, then optionally asks Ollama to refine JSON.
3. `COREMENTOR_AGENT_MODE` is currently mostly a reported setting. The actual behavior is controlled more directly by `COREMENTOR_LLM_ENABLED`, `COREMENTOR_CHROMA_ENABLED`, and `COREMENTOR_DOCLING_ENABLED`.
4. Career Lens exists in two places:
   - LangGraph orchestration version in `backend/agents/corementor_skills.py`
   - simpler placeholder endpoint in `backend/routers/gamification_router.py`
5. Agent audit logging is stored in `agent_interactions`, while product language may call it `AGENT_COMMS`.
6. The model name is inconsistent between `.env.example` and the code/agent README.

## 11. Where To Change Things

| Change needed | Go to |
| --- | --- |
| Add/remove workflow type | `backend/agents/schemas.py` and `backend/agents/graph.py` |
| Change which agents run for each workflow | `backend/agents/graph.py`, `_select_agents()` |
| Change graph order | `backend/agents/graph.py`, `build_corementor_graph()` |
| Change Grader scoring or prompt | `backend/agents/corementor_skills.py`, `build_marking_draft()` |
| Change Shadow Mentor diagnosis | `backend/agents/corementor_skills.py`, `build_shadow_mentor_profile()` |
| Change daily homework plan | `backend/agents/corementor_skills.py`, `build_homework_plan()` |
| Change Career Architect output | `backend/agents/corementor_skills.py`, `build_career_lens()` |
| Change XP recommendation logic | `backend/agents/corementor_skills.py`, `build_gamification_recommendation()` |
| Change Ollama model/settings | `.env`, `.env.example`, `backend/agents/config.py` |
| Change vector-memory collections | `.env`, `backend/agents/config.py`, `backend/agents/runtime.py` |
| Change Chroma seed examples | `backend/scripts/init_chroma.py` |
| Change persistence rules | `backend/agents/repository.py`, `persist_graph_outputs()` |
| Change orchestration API permissions | `backend/routers/orchestration_router.py` |
| Change teacher orchestration UI | `frontend/app/dashboard/teacher/page.tsx` |
| Change admin health UI | `frontend/app/dashboard/admin/page.tsx` |
| Change student-facing AI outputs | `frontend/app/dashboard/student/page.tsx` |
| Change parent-facing AI outputs | `frontend/app/dashboard/parent/page.tsx` |

## 12. Practical Recommendation

Before changing agent behavior, first decide whether the change belongs to:

1. graph routing,
2. agent skill logic,
3. runtime configuration,
4. persistence,
5. frontend display.

Most behavior changes should happen in `backend/agents/corementor_skills.py`. Most operational changes should happen in `.env` and `backend/agents/config.py`. Most workflow-order changes should happen in `backend/agents/graph.py`.
