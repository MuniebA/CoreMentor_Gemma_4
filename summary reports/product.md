Based on the system design, this is a **local multi-agent learning platform**. It is not “one AI chatbot.” It is a small agentic mesh where each agent has one job, and a central coordinator controls when each agent runs so the local GPU/CPU is not overloaded. The design defines four main worker agents: **The Grader, The Shadow Mentor, The Load Balancer, and The Career Architect**, controlled by a **Mesh Coordinator**. 

---

# Product Description: Local Agentic Learning Orchestrator

The product is an AI-assisted homework, assessment, and personalization platform for **teachers, students, and parents**. Teachers upload lessons, exercises, answer keys, and notes. Students submit homework images or documents. The system performs an initial AI marking pass, finds mistake patterns, diagnoses long-term weaknesses, adjusts the student’s daily homework mix, and converts standard schoolwork into career-themed learning tasks.

The key idea is:

> **The Grader finds what is wrong.
> The Shadow Mentor explains why it is happening.
> The Load Balancer decides what the student should practise next.
> The Career Architect makes that practice feel useful by linking it to the student’s career goal.**

The teacher still remains the final authority. AI marks stay in a **Pending** state until the teacher approves them. This is important because the system is designed as a **human-in-the-loop education platform**, not a fully automated grading authority. 

---

# 1. Agent Hierarchy

The hierarchy should look like this:

```text
Teacher / Student / Parent Dashboards
        ↓
FastAPI Backend
        ↓
Mesh Coordinator / Local Agentic Orchestrator
        ↓
------------------------------------------------
| The Grader | Shadow Mentor | Load Balancer | Career Architect |
------------------------------------------------
        ↓
PostgreSQL + ChromaDB + Local File Storage
```

There are technically **5 moving AI-system parts**:

| Layer          |                 Name |               Is it an agent? | Main job                                                              |
| -------------- | -------------------: | ----------------------------: | --------------------------------------------------------------------- |
| Control layer  |     Mesh Coordinator | Yes, but mostly orchestration | Decides which agent runs, controls turn-taking, prevents GPU overload |
| Worker agent 1 |           The Grader |                           Yes | Reads homework, marks it, extracts mistake patterns                   |
| Worker agent 2 |    The Shadow Mentor |                           Yes | Studies long-term performance and identifies root causes              |
| Worker agent 3 |    The Load Balancer |      Semi-agent / logic agent | Builds the daily homework mix                                         |
| Worker agent 4 | The Career Architect |                           Yes | Converts normal lessons into career-themed tasks                      |

The **Mesh Coordinator** should be built with **LangGraph**, because the system is naturally a graph of nodes and edges: Grader → Shadow Mentor → Load Balancer → Career Architect. LangChain’s current agent documentation describes graph-based agent runtimes using nodes, edges, model nodes, and tool nodes, which fits this exact design. ([LangChain Docs][1])

---

# 2. Common Databases and Shared Memory

The system should not use only one database. It needs three storage layers:

| Storage                  | Recommended tool                                | Purpose                                                                                       |
| ------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Main relational database | **PostgreSQL**                                  | Source of truth for users, classes, assignments, submissions, grades, homework plans, appeals |
| Vector memory            | **ChromaDB** / LangChain `Chroma`               | Stores semantic memory such as student mistake patterns and career-context data               |
| Local file storage       | `/uploads`, local disk, or object storage later | Stores homework images, answer key files, scanned worksheets, PDFs                            |

Your system design already identifies **PostgreSQL** as the main database and **ChromaDB** as the vector memory for student history and mistake patterns.  In LangChain, the Chroma integration is exposed through the `Chroma` vector store package, while SQL access can be handled through `SQLDatabase` or `SQLDatabaseToolkit` when an agent needs controlled database access. ([LangChain Docs][2])

One important improvement: the PDF uses both `AGENT_COMMS` and `AGENT_INTERACTIONS`. I would standardize the name to:

```text
AGENT_COMMS
```

Use it as the **agent whiteboard / audit log**.

ChromaDB should store **semantic memory**, not transactional messages. PostgreSQL should store actual agent communication logs because it is easier to audit, filter, approve, and display in the teacher dashboard.

---

# 3. Core Shared Tables

The agents all depend on the same PostgreSQL schema.

| Table                             | Purpose                                                                | Used by                                        |
| --------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| `USER`                            | Stores teachers, students, parents                                     | All dashboards                                 |
| `STUDENT_PROFILE`                 | Stores career goal and skill-tree XP                                   | Shadow Mentor, Load Balancer, Career Architect |
| `CLASS`                           | Stores class information                                               | Teacher dashboard                              |
| `ENROLLMENT`                      | Connects students to classes                                           | Backend routing                                |
| `ASSIGNMENT`                      | Stores standard lesson content, answer key path, career-themed version | Grader, Career Architect                       |
| `SUBMISSION`                      | Stores student homework image path                                     | Grader                                         |
| `AI_MARKING_DRAFT` / `AI_MARKING` | Stores score, feedback, pending/approved status, agent log             | Grader, Teacher Review, Appeal flow            |
| `AGENT_COMMS`                     | Stores JSON messages exchanged by agents                               | All agents                                     |
| `HW_PLAN` / `DAILY_HOMEWORK_PLAN` | Stores the homework recipe generated by Load Balancer                  | Load Balancer, Career Architect                |
| `APPEAL`                          | Stores student appeals after grading                                   | Student, Teacher, Grader log review            |

The system design also defines ChromaDB collections such as `student_patterns` and `career_data`. `student_patterns` stores semantic mistake patterns for RAG retrieval, while `career_data` stores real-world application examples for the Career Architect. 

---

# 4. Agent 0: Mesh Coordinator

## Product role

The Mesh Coordinator is the “manager” of the AI system. The backend does not directly call every agent randomly. Instead, it sends a request to the Coordinator, and the Coordinator decides:

1. Which agent should run first.
2. What data that agent needs.
3. Whether the next agent should run.
4. Where the result should be saved.
5. Whether the teacher must review the result.
6. Whether the system should stop because another GPU-heavy job is already running.

This is important because the system is designed to run locally. The PDF specifically mentions **single-inference locking** so that agents do not fight for limited local GPU resources. 

## Recommended LangChain / LangGraph components

| Need          | Component                                       |
| ------------- | ----------------------------------------------- |
| Orchestration | `LangGraph StateGraph`                          |
| Agent runtime | `create_agent` or custom LangGraph nodes        |
| Local LLM     | `ChatOllama`                                    |
| State object  | Pydantic model or `TypedDict`                   |
| Logging       | Custom PostgreSQL tool writing to `AGENT_COMMS` |
| GPU lock      | Python `asyncio.Lock` or mutex wrapper          |
| Human review  | Custom `teacher_approval_node`                  |

For local model calls, use LangChain’s `ChatOllama` integration from `langchain_ollama`. The current LangChain reference exposes `ChatOllama` as the Ollama chat model wrapper. ([LangChain Reference Docs][3])

---

# 5. Agent 1: The Grader

## Product role

The Grader is responsible for **first-pass homework marking**.

It receives a submitted homework image or document, extracts the student’s written answer, compares it against the teacher’s answer key, assigns an initial score, writes feedback, and records the mistake pattern.

The Grader should never directly publish a final grade. It should create an **AI marking draft** with status:

```text
Pending
```

The teacher then reviews the marking before it becomes official.

## Inputs

| Input                     | Source                                        |
| ------------------------- | --------------------------------------------- |
| Student submission image  | `SUBMISSION.image_url`                        |
| Assignment ID             | `SUBMISSION.assignment_id`                    |
| Answer key                | `ASSIGNMENT.answer_key_path`                  |
| Student profile           | `STUDENT_PROFILE`                             |
| Previous struggle profile | ChromaDB `student_patterns`                   |
| Teacher notes             | PostgreSQL notes table or assignment metadata |

## Processing steps

1. Load the homework image or document.
2. Convert it into structured text.
3. Compare the extracted answer against the teacher answer key.
4. Identify correct answers, wrong answers, missing steps, and weak topics.
5. Generate:

   * initial score,
   * feedback,
   * confidence score,
   * mistake pattern,
   * agent log.
6. Save the result into `AI_MARKING_DRAFT`.
7. Send mistake patterns to the Shadow Mentor.

## Recommended components

| Node purpose                       | LangChain / tool component                         |
| ---------------------------------- | -------------------------------------------------- |
| Load homework image/PDF            | `DoclingLoader`                                    |
| Document parsing / OCR replacement | Docling                                            |
| Local LLM grading                  | `ChatOllama`                                       |
| Prompting                          | `ChatPromptTemplate`                               |
| Structured output                  | `PydanticOutputParser` or structured output schema |
| Save score                         | Custom PostgreSQL write tool                       |
| Log agent activity                 | Custom `AGENT_COMMS` write tool                    |
| Store mistake pattern              | `Chroma` vector store + `OllamaEmbeddings`         |

Use **Docling** here instead of a raw OCR-only approach. LangChain’s Docling integration provides `DoclingLoader`, which is designed to load multiple document types into LangChain documents and preserve richer document structure for grounding. ([LangChain Docs][4])

## Output example

```json
{
  "student_id": "S123",
  "assignment_id": "A456",
  "score": 72,
  "confidence": 0.81,
  "mistake_patterns": [
    "weak fraction simplification",
    "confuses area and perimeter",
    "skips unit conversion"
  ],
  "feedback": "Good attempt, but you lost marks because your working skipped the conversion step.",
  "status": "Pending"
}
```

## Plain-English job description

The Grader is like a teaching assistant. It checks the homework first, but it does not have final authority. Its real value is not only the mark; it extracts the pattern behind the mistakes so the next agents can personalize learning.

---

# 6. Agent 2: The Shadow Mentor

## Product role

The Shadow Mentor is the long-term learning analyst.

It does not mainly mark work. Instead, it looks across weeks or months of grades, submissions, teacher notes, and mistake patterns to identify the student’s deeper learning issues.

For example, the Grader may say:

```text
The student got 3 algebra questions wrong.
```

The Shadow Mentor explains:

```text
The root issue is not algebra itself. The student struggles to translate word problems into equations.
```

This is why it is called “Shadow Mentor”: it quietly watches the student’s journey over time and builds an evidence-based learning profile.

## Inputs

| Input                   | Source                            |
| ----------------------- | --------------------------------- |
| Mistake patterns        | From The Grader                   |
| Historical marks        | `AI_MARKING_DRAFT` / `AI_MARKING` |
| Teacher notes           | PostgreSQL                        |
| Student profile         | `STUDENT_PROFILE`                 |
| Long-term vector memory | ChromaDB `student_patterns`       |

## Processing steps

1. Retrieve recent and historical mistake patterns.
2. Query ChromaDB for similar past mistakes.
3. Compare latest performance with long-term trends.
4. Diagnose root causes.
5. Produce priority subjects or skills.
6. Update the student’s struggle profile.
7. Send priority list to the Load Balancer.
8. Generate parent/student-friendly summaries.

The system design specifically says the Shadow Mentor uses RAG to query teacher notes and past grades, and it uses the `student_patterns` ChromaDB collection for long-term memory. 

## Recommended components

| Node purpose            | LangChain / tool component                          |
| ----------------------- | --------------------------------------------------- |
| Retrieve student memory | `Chroma.as_retriever()`                             |
| Vector store            | `Chroma`                                            |
| Embeddings              | `OllamaEmbeddings`                                  |
| Read grades/notes       | `SQLDatabase` or controlled backend repository tool |
| Root-cause analysis     | `ChatOllama`                                        |
| Prompting               | `ChatPromptTemplate`                                |
| Structured output       | Pydantic schema                                     |
| Save summary            | PostgreSQL write tool                               |
| Save new memory         | ChromaDB upsert                                     |

## Output example

```json
{
  "student_id": "S123",
  "root_cause": "The student understands formulas but struggles to identify which formula applies from word problems.",
  "priority_subjects": [
    {
      "subject": "Math",
      "skill": "word problem interpretation",
      "priority": "high"
    },
    {
      "subject": "Science",
      "skill": "unit conversion",
      "priority": "medium"
    }
  ],
  "parent_summary": "Your child is improving in calculation accuracy but needs more practice understanding question wording."
}
```

## Plain-English job description

The Shadow Mentor is the system’s memory and diagnosis agent. It answers the question: **“What is the student repeatedly struggling with, and why?”**

---

# 7. Agent 3: The Load Balancer

## Product role

The Load Balancer decides the student’s daily homework mix.

This agent should be more deterministic than the others. It does not need to generate long text. Its job is to calculate what the student should practise today based on:

1. Weaknesses found by the Shadow Mentor.
2. Recent grades.
3. Career goal.
4. Teacher-assigned workload.
5. Student fatigue or workload limits.
6. Upcoming deadlines.

For example, instead of giving every student the same homework, it may generate:

```text
Today’s recipe:
- 5 Math word problems
- 2 Science unit conversion questions
- 1 English comprehension exercise
```

The system design describes the Load Balancer as the agent that personalizes the homework mix and sends the “recipe” to the Career Architect. 

## Inputs

| Input                 | Source                        |
| --------------------- | ----------------------------- |
| Priority subjects     | Shadow Mentor                 |
| Career goal           | `STUDENT_PROFILE.career_goal` |
| Recent scores         | `AI_MARKING`                  |
| Available assignments | `ASSIGNMENT`                  |
| Existing plans        | `HW_PLAN`                     |

## Processing steps

1. Read the student’s current weakness profile.
2. Assign subject weights.
3. Choose how many tasks from each subject.
4. Set difficulty level.
5. Save the plan into `HW_PLAN`.
6. Send the recipe to the Career Architect.

## Recommended components

| Node purpose                    | LangChain / tool component                  |
| ------------------------------- | ------------------------------------------- |
| Deterministic weighting         | `RunnableLambda` or custom Python component |
| Read student data               | PostgreSQL repository tool                  |
| Save homework plan              | PostgreSQL write tool                       |
| Optional explanation generation | `ChatOllama`                                |
| Structured output               | Pydantic schema                             |

This is the one “agent” where I would avoid overusing an LLM. The core should be a normal algorithm. The LLM can explain the plan, but it should not be responsible for the actual scoring formula.

## Output example

```json
{
  "student_id": "S123",
  "planned_date": "2026-05-13",
  "homework_recipe": {
    "math": {
      "count": 5,
      "difficulty": "medium",
      "focus": "word problems"
    },
    "science": {
      "count": 2,
      "difficulty": "easy",
      "focus": "unit conversion"
    },
    "english": {
      "count": 1,
      "difficulty": "medium",
      "focus": "question interpretation"
    }
  }
}
```

## Plain-English job description

The Load Balancer is like a study planner. It answers: **“What should this student practise next, and how much?”**

---

# 8. Agent 4: The Career Architect

## Product role

The Career Architect turns normal schoolwork into career-themed learning.

This is the engagement agent. It takes a normal lesson and rewrites it so the student sees why it matters in the real world.

For example, if the student wants to become a doctor:

```text
Standard math question:
Calculate the percentage increase from 40 to 50.

Career-themed version:
A patient’s blood pressure reading increased from 40 units to 50 units. Calculate the percentage increase.
```

But this agent must not destroy the academic meaning. It has to preserve the same learning objective, difficulty, and answer logic.

The system design says the Career Architect uses the student profile, lesson database, and Shadow Mentor history to create a personalized “Quest” instead of a generic worksheet. 

## Inputs

| Input            | Source                        |
| ---------------- | ----------------------------- |
| Homework recipe  | Load Balancer / `HW_PLAN`     |
| Career goal      | `STUDENT_PROFILE.career_goal` |
| Standard content | `ASSIGNMENT.content_standard` |
| Career data      | ChromaDB `career_data`        |
| Difficulty level | Shadow Mentor / Load Balancer |

## Processing steps

1. Read the student’s career goal.
2. Retrieve real-world career examples from ChromaDB.
3. Read the standard lesson content.
4. Apply the homework recipe.
5. Rewrite the task into a career-themed version.
6. Verify that the answer and skill target remain correct.
7. Save the result into `ASSIGNMENT.career_themed` or `personalized_content`.
8. Send it to the Student Dashboard.

## Recommended components

| Node purpose                  | LangChain / tool component                                     |
| ----------------------------- | -------------------------------------------------------------- |
| Retrieve career examples      | `Chroma.as_retriever(collection="career_data")`                |
| Generate themed content       | `ChatOllama`                                                   |
| Prompting                     | `ChatPromptTemplate`                                           |
| Validate academic correctness | Second `ChatOllama` verification node or deterministic checker |
| Structured output             | Pydantic schema                                                |
| Save themed content           | PostgreSQL write tool                                          |

## Output example

```json
{
  "student_id": "S123",
  "career_goal": "Doctor",
  "subject": "Math",
  "original_skill": "percentage increase",
  "themed_task": "A patient's dosage increased from 40mg to 50mg. Calculate the percentage increase.",
  "why_this_matters": "Doctors often compare changes in measurements, dosage, and patient readings."
}
```

## Plain-English job description

The Career Architect answers: **“How do I make this lesson feel connected to the student’s future?”**

---

# 9. End-to-End Workflow

## Main homework cycle

```text
Student uploads homework
        ↓
SUBMISSION record created
        ↓
The Grader reads image using Docling/OCR
        ↓
The Grader compares answer with teacher answer key
        ↓
AI_MARKING_DRAFT is created as Pending
        ↓
Mistake patterns are sent to Shadow Mentor
        ↓
Teacher reviews and approves/rejects mark
        ↓
Student sees official feedback
```

This matches the design’s “Homework & Feedback Cycle,” where the Grader acts as the processor but the mark remains pending until teacher verification. 

## Personalization cycle

```text
Grader finds mistake patterns
        ↓
Shadow Mentor diagnoses root cause
        ↓
Load Balancer creates homework recipe
        ↓
Career Architect creates themed tasks
        ↓
Student receives Daily Quest
```

The system design describes this as the internal brain of the system: the Grader identifies what is wrong, the Shadow Mentor explains why, the Load Balancer decides how much to focus on it, and the Career Architect makes it engaging. 

## Appeal cycle

```text
Student disagrees with mark
        ↓
Student submits appeal note
        ↓
Teacher dashboard receives appeal
        ↓
Teacher views original image, OCR text, Grader log, and AI reasoning summary
        ↓
Teacher makes final decision
```

The PDF explicitly says that when a student appeals, the system pulls the Grader’s agent log so the teacher can understand why the AI gave that mark before making a final decision. 

---

# 10. Langflow / LangChain Node Blueprint

## A. Grader Flow

```text
Submission Input
 → PostgreSQL Read Submission
 → PostgreSQL Read Assignment Answer Key
 → DoclingLoader
 → Grader Prompt
 → ChatOllama
 → PydanticOutputParser
 → PostgreSQL Write AI_MARKING_DRAFT
 → Chroma Upsert student_patterns
 → PostgreSQL Write AGENT_COMMS
```

Recommended node names:

| Node                       | Component                               |
| -------------------------- | --------------------------------------- |
| `SubmissionInputNode`      | FastAPI / Langflow input                |
| `SubmissionSQLReader`      | `SQLDatabase` or custom PostgreSQL tool |
| `HomeworkDoclingParser`    | `DoclingLoader`                         |
| `GraderPromptNode`         | `ChatPromptTemplate`                    |
| `LocalGraderLLM`           | `ChatOllama`                            |
| `GraderOutputParser`       | Pydantic structured output              |
| `SaveMarkingDraftTool`     | Custom SQL write tool                   |
| `SaveMistakePatternVector` | `Chroma` vector store                   |
| `AgentCommsLogger`         | Custom SQL write tool                   |

---

## B. Shadow Mentor Flow

```text
Student ID
 → PostgreSQL Read Historical Marks
 → Chroma Retriever student_patterns
 → Teacher Notes Retriever
 → Shadow Mentor Prompt
 → ChatOllama
 → Root Cause Parser
 → Chroma Update student_patterns
 → PostgreSQL Write AGENT_COMMS
 → Send Priority List to Load Balancer
```

Recommended node names:

| Node                      | Component                  |
| ------------------------- | -------------------------- |
| `StudentHistorySQLReader` | `SQLDatabase`              |
| `StudentPatternRetriever` | `Chroma.as_retriever()`    |
| `ShadowMentorPrompt`      | `ChatPromptTemplate`       |
| `ShadowMentorLLM`         | `ChatOllama`               |
| `RootCauseParser`         | Pydantic structured output |
| `UpdateStudentMemory`     | `Chroma` upsert            |
| `SendPrioritySubjects`    | Custom handoff node        |

---

## C. Load Balancer Flow

```text
Priority Subjects
 → Read Student Profile
 → Read Available Assignments
 → Subject Weight Calculator
 → Homework Recipe Generator
 → PostgreSQL Write HW_PLAN
 → Send Recipe to Career Architect
```

Recommended node names:

| Node                      | Component                                  |
| ------------------------- | ------------------------------------------ |
| `PriorityInputNode`       | LangGraph state                            |
| `StudentProfileReader`    | PostgreSQL tool                            |
| `AssignmentPoolReader`    | PostgreSQL tool                            |
| `SubjectWeightCalculator` | `RunnableLambda` / custom Python component |
| `HomeworkRecipeParser`    | Pydantic schema                            |
| `SaveHWPlanTool`          | PostgreSQL write tool                      |

---

## D. Career Architect Flow

```text
HW_PLAN Recipe
 → Read Student Career Goal
 → Read Standard Assignment Content
 → Chroma Retriever career_data
 → Career Architect Prompt
 → ChatOllama
 → Verification Node
 → PostgreSQL Save career_themed content
 → Student Dashboard
```

Recommended node names:

| Node                          | Component                             |
| ----------------------------- | ------------------------------------- |
| `HWPlanReader`                | PostgreSQL tool                       |
| `CareerGoalReader`            | PostgreSQL tool                       |
| `CareerDataRetriever`         | `Chroma.as_retriever()`               |
| `CareerArchitectPrompt`       | `ChatPromptTemplate`                  |
| `CareerArchitectLLM`          | `ChatOllama`                          |
| `AcademicCorrectnessVerifier` | `ChatOllama` or deterministic checker |
| `SavePersonalizedContentTool` | PostgreSQL write tool                 |

---

# 11. Final Product Positioning

This product should be described as:

> **A local AI-powered education platform that combines automated first-pass grading, long-term learning diagnosis, adaptive homework planning, and career-themed personalization while keeping teachers in control.**

Its strongest selling points are:

1. **Local-first AI**
   Runs with Ollama and local databases instead of depending fully on cloud AI.

2. **Teacher-controlled grading**
   AI creates drafts, but teachers approve final marks.

3. **Long-term student memory**
   ChromaDB stores mistake patterns so the system improves over time.

4. **Personalized homework load**
   The Load Balancer gives each student a different practice mix.

5. **Career-connected learning**
   The Career Architect makes lessons feel useful by linking them to the student’s career goal.

6. **Transparent agent logging**
   Every agent action is recorded in `AGENT_COMMS`, so the teacher can see why the system made a recommendation.

For the MVP, build in this order:

```text
1. PostgreSQL schema + auth + role dashboards
2. File upload and local storage
3. Grader Agent with Docling + ChatOllama
4. Teacher approval dashboard
5. ChromaDB student_patterns memory
6. Shadow Mentor
7. Load Balancer
8. Career Architect
9. Parent summaries and appeal flow
```

That gives you a clean story for presentation: first the system can mark, then it can remember, then it can adapt, then it can personalize.

[1]: https://docs.langchain.com/oss/python/langchain/agents?utm_source=chatgpt.com "Agents - Docs by LangChain"
[2]: https://docs.langchain.com/oss/python/integrations/vectorstores/chroma?utm_source=chatgpt.com "Chroma integration - Docs by LangChain"
[3]: https://reference.langchain.com/python/langchain-ollama/chat_models/ChatOllama?utm_source=chatgpt.com "ChatOllama | langchain_ollama"
[4]: https://docs.langchain.com/oss/python/integrations/document_loaders/docling?utm_source=chatgpt.com "Docling integration - Docs by LangChain"
