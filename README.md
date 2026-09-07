# AI Voice Technical Interview Platform

An adaptive, real-time technical mock interview platform powered by **LangGraph**, **FastAPI**, **Groq LLMs & Whisper STT**, **Next.js**, and **PostgreSQL**. 

Feed it your resume (PDF or DOCX) and optional target Job Description, and the agent extracts your technical background, builds a personalized multi-round interview plan, conducts a live interruptible voice interview, grades your responses in real time, drills into gaps with follow-ups, and delivers a comprehensive performance scorecard.

---

## Key Highlights

- **Auth-First Architecture**: Gated entry at `/login` with simple email/password registration and sign-in backed by **PostgreSQL**, **bcrypt** password hashing, and signed **JWT** access tokens.
- **Resume-Grounded Planning**: Extracts projects, role history, tech stack, and gap areas using `pypdf` / `python-docx` and structured LLM extraction.
- **Real-Time Interruptible Voice Interview**: Full-duplex WebSocket (`/ws/interview/{id}`) with sentence-level streaming TTS and Groq Whisper Large v3 Turbo speech-to-text.
- **Push-to-Record with Live Audio VU Meter**: Interactive Web Audio recording engine with live frequency analysis (`AnalyserNode`) and animated volume bars confirming microphone activity in real time.
- **Barge-In Support**: Candidates can interrupt the AI at any time during spoken turns.
- **Adaptive Questioning & Follow-Ups**: Powered by a LangGraph state machine that evaluates answers on technical accuracy, identifies missing points, and dynamically asks follow-up questions when weak spots are detected.
- **Cost & Latency Hardened**: Context-aware template-driven round transitions and greeting intros, per-session LLM call budget caps, in-memory session cleanup TTL, and non-blocking asynchronous executor threads.
- **Vercel-Inspired Monochrome Developer UI**: Minimalist, data-dense interface built with Tailwind CSS v4, JetBrains Mono, and Inter typography.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **AI / Graph Engine** | LangGraph, LangChain-Groq (Llama 3.3 70B Versatile / GPT-OSS) |
| **Speech AI** | Groq Whisper Large v3 Turbo (STT), gTTS (TTS) |
| **Backend API** | FastAPI, Uvicorn, Python 3.11+, WebSockets |
| **Database & Auth** | PostgreSQL, SQLAlchemy ORM, PyJWT, bcrypt |
| **Document Parsing** | `pypdf`, `python-docx` |
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide React |
| **Audio Processing** | Web Audio API (`AudioContext`, `AnalyserNode`, `MediaRecorder`) |

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Client [Next.js Frontend]
        Auth["/login (Auth-First Gate)"]
        Dashboard["/ (Resume & Config Dashboard)"]
        Briefing["/briefing/[id] (Plan & Hardware Check)"]
        Interview["/interview/[id] (Live Voice Room)"]
        Summary["/summary/[id] (Scorecard & Review)"]
    end

    subgraph Backend [FastAPI Server]
        AuthAPI["/api/auth (Register, Login, Me)"]
        SessionAPI["/api/upload-resume & /api/start-session"]
        WS["/ws/interview/[id] (WebSocket Hub)"]
        Executor["Async Threadpool Executor"]
    end

    subgraph Database [PostgreSQL]
        UsersTable[(Users Table)]
    end

    subgraph Engine [LangGraph State Machine]
        Planner["Resume / JD Planner"]
        QuestionGen["Question Generator"]
        Evaluator["Answer Evaluator (1-10)"]
        FollowUp["Follow-up Generator"]
        Advance["Category Advancer"]
        SummaryNode["Structured Session Summary"]
    end

    subgraph External [Groq Cloud]
        LLM["Llama 3.3 70B Versatile"]
        Whisper["Whisper Large v3 Turbo"]
    end

    Auth -->|POST /api/auth| AuthAPI --> UsersTable
    Dashboard -->|POST /api/upload-resume| SessionAPI --> Planner
    Briefing -->|GET /api/session/[id]| SessionAPI
    Interview <-->|Full-Duplex WS| WS
    WS <--> Executor <--> Engine
    Engine <--> LLM
    WS <--> Whisper
    Interview --> Summary
```

---

## Project Structure

```
interview-prep-agent/
├── backend/
│   ├── auth.py              # Password hashing (bcrypt) & JWT token handling
│   ├── database.py          # PostgreSQL SQLAlchemy engine, models, & init_db
│   ├── main.py              # FastAPI application, REST endpoints, & WebSocket hub
│   └── voice_handler.py     # Groq Whisper STT, gTTS generation, sentence splitter
├── frontend/
│   ├── src/app/
│   │   ├── components/      # Reusable client components (Navbar)
│   │   ├── login/           # Auth-first Sign In & Registration page
│   │   ├── briefing/[id]/   # Pre-interview plan breakdown & mic hardware check
│   │   ├── interview/[id]/  # Live interview room (mic capture, VU meter, WS stream)
│   │   ├── summary/[id]/    # Post-session performance report & gap breakdown
│   │   ├── globals.css      # CSS design tokens, keyframes, transitions
│   │   ├── layout.tsx       # Root layout with JetBrains Mono / Inter fonts
│   │   └── page.tsx         # Main resume analyzer & interview config dashboard
│   ├── package.json
│   └── tsconfig.json
├── config.py                # Groq client initialization
├── graph.py                 # LangGraph StateGraph definition, checkpointer, & routing
├── nodes.py                 # Core node functions (planners, question, eval, follow-up)
├── resume_extract.py        # PDF and DOCX text extraction & JSON schema parsing
├── state.py                 # TypedDict schema for InterviewState
├── requirements.txt         # Python dependencies
├── .env.example             # Documented environment variables template
└── README.md
```

---

## Prerequisites

Ensure you have the following installed on your machine:
- **Python 3.11+**
- **Node.js 18+** and **npm**
- **PostgreSQL 14+** (running locally or a remote connection string)
- **Groq API Key** (obtain free from [Groq Console](https://console.groq.com/keys))

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/interview-prep-agent.git
cd interview-prep-agent
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
# Windows PowerShell:
Copy-Item .env.example .env

# macOS / Linux:
cp .env.example .env
```

Open `.env` and fill in your credentials:

```env
# Groq API Key (required for LLM & Whisper STT)
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# PostgreSQL Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=postgres

# JWT Authentication Secret
JWT_SECRET=super_secret_jwt_key_change_in_production
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440
```

> **Note**: All credentials throughout the project are read strictly from `.env`. Zero secrets are hardcoded.

---

### 3. Backend Setup & Run

1. Create and activate a Python virtual environment:
   ```bash
   # Windows:
   python -m venv venv
   .\venv\Scripts\Activate.ps1

   # macOS / Linux:
   python3 -m venv venv
   source venv/bin/activate
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Start the FastAPI backend server:
   ```bash
   python -m uvicorn backend.main:app --reload --port 8000
   ```
   The backend will automatically connect to PostgreSQL and initialize tables on startup.
   - API Docs: `http://localhost:8000/docs`
   - Health Check: `http://localhost:8000/api/health`

---

### 4. Frontend Setup & Run

1. Open a second terminal and navigate to `frontend`:
   ```bash
   cd frontend
   npm install
   ```

2. Start the Next.js development server:
   ```bash
   npm run dev
   ```

3. Open your browser at:
   ```
   http://localhost:3000
   ```

---

## User Workflow

1. **Authentication (`/login`)**:
   - First-time visitors are automatically routed to the Login/Registration page.
   - Register a new account or sign in with existing credentials.
   - A signed JWT token is securely stored in `localStorage`, redirecting to `/`.

2. **Setup & Configuration (`/`)**:
   - Choose **Resume-Grounded Mode** (upload PDF/DOCX) or **Job Description / Topics Mode**.
   - Optionally configure session depth:
     - Questions per topic: `1`, `2 (Default)`, or `3`
     - Follow-up depth: `Off (0)`, `Standard (2)`, or `Deep (3)`
   - Click **Initialize Interview Session**.

3. **Pre-Session Briefing (`/briefing/[sessionId]`)**:
   - Review the AI-generated topic rounds extracted from your background (`[project]`, `[skill]`, `[experience]`, `[gap]`).
   - Run a quick hardware check to verify microphone permissions and capture.
   - Review protocol guidelines and click **Begin Interview**.

4. **Live Voice Interview (`/interview/[sessionId]`)**:
   - The AI introduces itself and asks the first question out loud.
   - Click **`[ 🎤 Record Answer ]`** to start speaking. An animated green audio VU meter dynamically confirms microphone audio level.
   - Click **`[ ⏹ Submit Answer ]`** when done. The audio is instantly transcribed with Groq Whisper and submitted.
   - The AI streams real-time feedback (`[eval:score] [8/10]`), identifies missing points, and dynamically probes or transitions to the next round.
   - Candidates can click **Interrupt** at any time to barge in.

5. **Performance Scorecard (`/summary/[sessionId]`)**:
   - Review overall average score, questions answered, and identified weak topics.
   - Inspect per-category progress bars with weak topic highlights.
   - Expand collapsible Q&A cards to compare candidate transcripts against reference model ideal answers.
   - Click **Practice Weak Topics** to immediately launch a tailored follow-up session focusing on identified gaps.

---

## API Reference

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register new user with email & password | No |
| `POST` | `/api/auth/login` | Authenticate user & receive JWT token | No |
| `GET` | `/api/auth/me` | Fetch authenticated user profile | Bearer JWT |

### Session Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload-resume` | Upload resume (PDF/DOCX), parse topics, initialize graph session |
| `POST` | `/api/start-session` | Start session from raw Job Description or study topics |
| `GET` | `/api/session/{id}` | Retrieve session state, history, and category breakdown |

### WebSocket Endpoint (`/ws/interview/{sessionId}`)

Bidirectional WebSocket protocol:

- **Client &rarr; Server Messages**:
  - `{"type": "audio_chunk", "data": "<base64>", "filename": "answer.webm"}`: Submit voice answer
  - `{"type": "text_answer", "text": "..."}`: Fallback manual text answer
  - `{"type": "interrupt"}`: Signal candidate barge-in to stop AI audio
- **Server &rarr; Client Messages**:
  - `{"type": "session_init", "categories": [...], "current_question": "..."}`: Session start metadata
  - `{"type": "status", "status": "listening" | "transcribing" | "thinking" | "speaking" | "interrupted" | "completed"}`: State indicator
  - `{"type": "transcript", "speaker": "interviewer" | "candidate", "text": "..."}`: Turn transcript
  - `{"type": "audio_chunk", "data": "<base64_mp3>"}`: Sentence-level TTS playback
  - `{"type": "evaluation", "evaluation": {"score": 8, "missing_points": [...]}}`: Instant evaluation
  - `{"type": "transition", "message": "...", "next_category": "..."}`: Category advance notification
  - `{"type": "session_summary", "summary_data": {...}}`: Final session summary
  - `{"type": "ping"}`: 20-second keepalive signal

---

## Production Controls & Budget Limits

- **Cost Cap**: Enforced by `MAX_LLM_CALLS` environment variable (default: `25`). Once reached, the graph automatically bypasses follow-ups and synthesizes the summary report.
- **Session Eviction**: Background cleaner task evicts inactive sessions older than `SESSION_TTL_SECONDS` (default: 1 hour) to eliminate server memory leaks.
- **Async Execution**: Blocking LangGraph and LLM invocations run inside `loop.run_in_executor` thread pools to ensure WebSocket ping/pong and keepalive signals remain responsive.

---

## License

MIT License. Free to use for personal mock interview preparation, educational projects, or portfolio demonstrations.

