# CoreMentor LangGraph Mesh

This package implements the local agentic orchestration described in
`product.md`.

## Graph Shape

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

The graph is built in `graph.py` with LangGraph `StateGraph`. The public entry
point is `POST /api/v1/orchestration/run`.

## Agent Responsibilities

- `grader`: creates a review-ready AI marking draft with `Pending` status.
- `shadow_mentor`: converts marks and mistake patterns into root-cause insight.
- `load_balancer`: deterministically creates the daily homework recipe.
- `career_architect`: reframes selected work around the student's career goal.
- `teacher_review_gate`: preserves the human-in-the-loop grading boundary.

## Persistence

The coordinator writes to existing tables:

- `ai_marking_drafts` for pending grader output.
- `daily_homework_plans` for load balancer recipes.
- `student_profiles` for Shadow Mentor summaries.
- `agent_interactions` as the current AGENT_COMMS-compatible audit log.

## Local Runtime Configuration

Configure the model and memory runtime in the project `.env` file:

```env
COREMENTOR_AGENT_MODE=hybrid
COREMENTOR_LLM_ENABLED=true
COREMENTOR_CHROMA_ENABLED=true
COREMENTOR_DOCLING_ENABLED=true

OLLAMA_BASE_URL=http://localhost:11434
COREMENTOR_OLLAMA_MODEL=gemma4:4b
COREMENTOR_OLLAMA_EMBED_MODEL=nomic-embed-text
COREMENTOR_OLLAMA_TEMPERATURE=0.2
COREMENTOR_OLLAMA_NUM_CTX=4096
COREMENTOR_OLLAMA_KEEP_ALIVE=10m

CHROMA_PERSIST_DIR=backend/storage/chroma
CHROMA_STUDENT_PATTERNS_COLLECTION=student_patterns
CHROMA_CAREER_DATA_COLLECTION=career_data
COREMENTOR_UPLOADS_DIR=backend/uploads
```

The chat model and embedding model are intentionally separate. `gemma4:4b` is
used for agent reasoning through `ChatOllama`; `nomic-embed-text` is used for
ChromaDB embeddings through `OllamaEmbeddings`.

## Local Setup

Install backend dependencies:

```bash
pip install -r backend/requirements.txt
```

Pull the local Ollama models:

```bash
ollama pull gemma4:4b
ollama pull nomic-embed-text
```

Create the ChromaDB collections and seed starter career examples:

```bash
python backend/scripts/init_chroma.py
```

You can also initialize collections through the API:

```http
POST /api/v1/orchestration/chroma/init
```

The runtime adapters are connected in `runtime.py` and called from
`corementor_skills.py`. If Ollama, ChromaDB, or Docling are unavailable, the
workflow keeps the deterministic fallback output and reports adapter status from:

```http
GET /api/v1/orchestration/health
```
