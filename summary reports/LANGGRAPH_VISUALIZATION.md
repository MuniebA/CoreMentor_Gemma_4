# CoreMentor LangGraph Visualization

Date reviewed: 2026-05-14

This file visualizes the current LangGraph system implemented in:

```text
backend/agents/graph.py
backend/agents/coordinator.py
backend/routers/orchestration_router.py
```

## 1. Main Runtime Entry

```mermaid
flowchart TD
    UI[Frontend dashboards or API client]
    API[POST /api/v1/orchestration/run]
    Auth[auth.decode_token]
    Coordinator[MeshCoordinator]
    Lock[Single inference lock]
    Graph[Compiled LangGraph]
    Response[OrchestrationResponse]

    UI --> API
    API --> Auth
    Auth --> Coordinator
    Coordinator --> Lock
    Lock --> Graph
    Graph --> Response
```

## 2. Current LangGraph Node Flow

This is the graph shape currently built by `build_corementor_graph()`.

```mermaid
flowchart TD
    START([START])
    Intake[intake<br/>Load SQL context and select agents]
    Grader[grader<br/>Create marking draft artifact]
    Review[teacher_review_gate<br/>Mark human review requirement]
    Shadow[shadow_mentor<br/>Diagnose patterns]
    Load[load_balancer<br/>Build daily homework recipe]
    Career[career_architect<br/>Create career lens and gamification artifact]
    Persist[persist_outputs<br/>Save artifacts to PostgreSQL]
    Finalize[finalize<br/>Set completed status]
    END([END])

    START --> Intake

    Intake -. conditional .-> Grader
    Intake -. conditional .-> Shadow
    Intake -. conditional .-> Load
    Intake -. conditional .-> Career
    Intake -. no selected agent .-> Persist

    Grader --> Review

    Review -. conditional .-> Shadow
    Review -. conditional .-> Load
    Review -. conditional .-> Career
    Review -. no remaining selected agent .-> Persist

    Shadow -. conditional .-> Load
    Shadow -. conditional .-> Career
    Shadow -. no remaining selected agent .-> Persist

    Load -. conditional .-> Career
    Load -. no remaining selected agent .-> Persist

    Career --> Persist
    Persist --> Finalize
    Finalize --> END
```

## 3. Workflow Selection Logic

The graph does not always run every agent. The `intake` node calls `_select_agents()` and then each conditional route chooses the next selected agent in order.

```mermaid
flowchart LR
    Request[OrchestrationRequest]

    Request --> Grade{workflow == grade_submission<br/>or submission_id exists?}
    Grade -- yes --> GradeAgents[grader -> shadow_mentor -> load_balancer -> career_architect]

    Grade -- no --> Support{workflow == student_support<br/>or daily_plan?}
    Support -- yes --> SupportAgents[shadow_mentor -> load_balancer -> career_architect]

    Support -- no --> Career{workflow == career_lens<br/>or assignment_id exists?}
    Career -- yes --> CareerAgents[career_architect]

    Career -- no --> DefaultAgents[shadow_mentor -> load_balancer -> career_architect]
```

## 4. State Object Moving Through The Graph

Every node receives and returns a shared `CoreMentorGraphState`.

```mermaid
flowchart TD
    State[CoreMentorGraphState]

    State --> Run[run_id]
    State --> Workflow[workflow]
    State --> Request[request]
    State --> Actor[actor]
    State --> Context[context]
    State --> Selected[selected_agents]
    State --> Artifacts[artifacts]
    State --> Persistence[persistence]
    State --> Audit[audit_log]
    State --> Errors[errors]
    State --> Status[status]

    Context --> SQLContext[student, submission, assignment,<br/>unit, marks, skills, open assignments]
    Artifacts --> AgentOutputs[grader, teacher_review,<br/>shadow_mentor, load_balancer,<br/>career_architect, gamification]
```

## 5. Agent Outputs And Persistence

```mermaid
flowchart TD
    Grader[grader artifact]
    Review[teacher_review artifact]
    Shadow[shadow_mentor artifact]
    Load[load_balancer artifact]
    Career[career_architect artifact]
    Game[gamification artifact]
    Persist[persist_outputs]

    Drafts[(ai_marking_drafts)]
    StudentProfiles[(student_profiles)]
    Plans[(daily_homework_plans)]
    Interactions[(agent_interactions)]

    Grader --> Persist
    Review --> Persist
    Shadow --> Persist
    Load --> Persist
    Career --> Persist
    Game --> Persist

    Persist --> Drafts
    Persist --> StudentProfiles
    Persist --> Plans
    Persist --> Interactions
```

Persistence rules are in:

```text
backend/agents/repository.py
persist_graph_outputs()
```

## 6. RAG And Runtime Adapters Around The Graph

The graph nodes call functions in `backend/agents/corementor_skills.py`. Those functions optionally use `CoreMentorRuntime`.

```mermaid
flowchart TD
    Node[Graph agent node]
    Skills[corementor_skills.py]
    Runtime[CoreMentorRuntime]

    LLM[ChatOllama<br/>JSON enrichment]
    Emb[OllamaEmbeddings]
    Chroma[(ChromaDB<br/>student_patterns<br/>career_data)]
    Docling[DoclingDocumentParser<br/>uploaded file text]

    Shadow[Shadow Mentor]
    Career[Career Architect]
    Grader[Grader]

    Node --> Skills
    Skills --> Runtime

    Runtime --> LLM
    Runtime --> Emb
    Emb --> Chroma
    Runtime --> Docling

    Grader --> Docling
    Shadow --> Chroma
    Career --> Chroma
    Skills --> LLM
```

Practical meaning:

- Grader can parse uploaded files through Docling, then ask Ollama to refine the draft.
- Shadow Mentor searches and writes `student_patterns` in ChromaDB.
- Career Architect searches `career_data` in ChromaDB.
- All agent artifacts can be refined by Ollama if `COREMENTOR_LLM_ENABLED=true`.

## 7. UI Views That Expose The Graph

```mermaid
flowchart TD
    Teacher[Teacher dashboard<br/>frontend/app/dashboard/teacher/page.tsx]
    Admin[Admin dashboard<br/>frontend/app/dashboard/admin/page.tsx]

    Run[POST /api/v1/orchestration/run]
    Audit[GET /api/v1/orchestration/audit/student_id]
    Health[GET /api/v1/orchestration/health]
    ChromaInit[POST /api/v1/orchestration/chroma/init]

    Teacher --> Run
    Teacher --> Audit
    Admin --> Health
    Admin --> ChromaInit
```

Teacher UI:

```text
/dashboard/teacher -> Agent Orchestration tab
```

Admin UI:

```text
/dashboard/admin -> Agent Health tab
```

## 8. Simplified Mental Model

```text
Request comes in
  -> intake loads context and chooses selected_agents
  -> selected agents run in fixed order
  -> each agent writes an artifact into state.artifacts
  -> persist_outputs saves selected artifacts to database
  -> finalize returns completed response
```

The graph shape is fixed, but the route through it changes depending on the workflow and request IDs.
