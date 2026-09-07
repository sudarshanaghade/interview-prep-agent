# Build Prompt: End-to-End AI Interview Platform

Use this as the spec/prompt for a coding agent (Claude Code, etc.) to build
this project phase by phase. It extends an existing LangGraph + Groq
mock-interview CLI/Streamlit tool into a full web platform with resume-aware
questions and real-time, interruptible voice.

---

## 1. Project Goal

Build a web platform where a candidate:
1. Uploads their resume.
2. The system parses it and generates an interview plan grounded in their
   actual projects/skills (optionally combined with a job description).
3. The candidate does a **live voice interview** — the agent asks questions
   out loud, the candidate answers out loud, and the candidate can
   **interrupt/barge in** at any point like a real call.
4. The agent scores each answer, drills into weak spots with follow-ups,
   and produces a session summary at the end.

This builds on an existing repo with:
- `state.py` — shared `InterviewState` LangGraph state object
- `nodes.py` — node functions: `planner`, `question_gen`, `evaluator`,
  `follow_up`, `advance`, `summary` — each calls Groq via `langchain-groq`,
  expects strict JSON, parsed defensively (`_extract_json`)
- `graph.py` — `StateGraph` wiring the above with conditional edges and
  `interrupt_before=["evaluator"]` so the caller can inject the candidate's
  answer before grading resumes
- `app.py` — CLI driver (to be replaced)
- `ui.py` — Streamlit UI (to be replaced)

---

## 2. Target Architecture

```
┌─────────────────┐        WebSocket (audio + control)      ┌──────────────────────┐
│  Next.js frontend │ ───────────────────────────────────── │   FastAPI backend     │
│  - resume upload  │                                        │   - LangGraph runtime │
│  - mic capture     │                                        │   - Groq STT/TTS/LLM  │
│  - client-side VAD │                                        │   - session state      │
│  - audio playback   │                                       │                        │
│  - live transcript   │                                      │                        │
└─────────────────┘                                        └──────────────────────┘
```

**Frontend:** Next.js (React), Web Audio API / MediaRecorder for mic capture,
`@ricky0123/vad-web` (Silero VAD, WASM) for **client-side** voice-activity
and interruption detection, a WebSocket client for the session, `<audio>`
sink fed by streamed TTS chunks.

**Backend:** FastAPI, one WebSocket endpoint per interview session, existing
LangGraph app embedded (swap the CLI/Streamlit input step for
"wait for utterance from WebSocket" at the `interrupt_before=["evaluator"]`
pause point). Groq clients for: LLM (existing), STT (Whisper Large v3 Turbo
or Distil-Whisper for speed), TTS (Groq TTS, streamed).

**Why client-side VAD:** interruption needs to feel instant. Detecting
"candidate started talking" in-browser lets the frontend mute/stop TTS
playback in the same tick, with zero round-trip. It also means only
utterance-segmented audio (not a raw continuous stream) gets sent to the
backend, simplifying the WebSocket protocol and cutting Groq STT calls.

**Why chunked STT instead of a persistent streaming socket to Groq:** Groq's
ASR endpoints (Whisper Large v3 / Turbo / Distil-Whisper) are fast
batch/REST endpoints, not a bidirectional streaming API. The realistic
pattern — and the one that actually feels "live" given Groq's inference
speed — is: client VAD detects end-of-utterance → send that one audio
segment to Groq STT → near-instant transcript back. TTS is the reverse:
stream LLM tokens → chunk into sentences → stream each sentence to Groq TTS
→ stream audio back to the client as it's generated, rather than waiting for
a full response.

---

## 3. Phase 1 — Resume Parsing + Resume-Grounded Question Generation

**Scope:** no voice yet. Just get resume → structured plan → questions
working, callable via a simple HTTP endpoint or CLI, reusing the existing
graph nodes as much as possible.

1. **`resume_extract.py`**
   - Input: uploaded PDF/DOCX file.
   - Extract raw text (`pypdf` for PDF, `python-docx` for DOCX). Scanned/
     image-only resumes are out of scope for v1 — require a text-layer PDF.
   - One Groq call (strict JSON, same defensive-parsing style as the
     existing nodes) producing:
     ```json
     {
       "skills": ["..."],
       "projects": [
         {"name": "...", "description": "...", "tech": ["..."]}
       ],
       "experience": [
         {"role": "...", "company": "...", "duration": "...", "highlights": ["..."]}
       ],
       "education": [{"degree": "...", "institution": "...", "year": "..."}]
     }
     ```

2. **New/updated `resume_planner` node** (replaces or extends `planner`):
   - Input: `resume_json` + optional JD or topic list (existing input path
     stays supported).
   - Output: the same `categories` plan structure `question_gen` already
     consumes, but each category is tagged with its source, e.g.:
     - `{"category": "System Design", "source": "project:X", "reason": "claims Redis caching in project X"}`
     - `{"category": "Kubernetes", "source": "gap", "reason": "JD requires it, resume doesn't mention it"}`
   - This tagging is what makes later questions resume-specific instead of
     generic.

3. **`question_gen` update:**
   - Pass only the relevant resume snippet for the current category into
     the prompt (not the whole resume), so questions reference specifics:
     "You mentioned using Redis for caching in [project] — why Redis over
     an in-memory dict there?"
   - Keep the existing temperature (0.4) and JSON-parsing conventions.

4. **Deliverable for this phase:** a script/endpoint that takes a resume
   file (+ optional JD text) and prints/returns the generated question plan
   and first question — no voice, no frontend required yet. This validates
   the resume→questions pipeline in isolation before adding voice
   complexity.

---

## 4. Phase 2 — Voice Pipeline (backend)

1. **VAD on the client**, using `@ricky0123/vad-web`:
   - Emits "speech start" / "speech end" events from the mic stream.
   - On "speech end": stop recording that utterance, send the audio blob to
     the backend over the WebSocket.
   - On "speech start" *while TTS audio is playing*: immediately stop local
     playback and send an `interrupt` control message to the backend so it
     can cancel the in-flight LLM/TTS call.

2. **Backend WebSocket protocol** (per session):
   - Client → server: `{"type": "audio_chunk", "data": <base64>}`,
     `{"type": "interrupt"}`
   - Server → client: `{"type": "transcript", "text": "..."}`,
     `{"type": "audio_chunk", "data": <base64>}` (TTS, streamed),
     `{"type": "question", "text": "..."}`, `{"type": "score", ...}`,
     `{"type": "session_summary", ...}`

3. **Backend flow per turn:**
   - Receive utterance audio → Groq STT (Distil-Whisper/Turbo) → transcript.
   - Feed transcript into the LangGraph run at the `interrupt_before=["evaluator"]`
     resume point (same mechanism as the CLI today, just fed from a
     WebSocket handler instead of `input()`).
   - Graph proceeds through `evaluator` → `follow_up` or `advance` as today.
   - Stream the next question's text token-by-token from Groq LLM, chunk
     into sentences, send each sentence to Groq TTS, stream resulting audio
     chunks back to the client immediately (don't wait for the full
     response to finish generating).
   - On an `interrupt` message: cancel the in-flight LLM/TTS generation
     tasks for that session and start listening for the candidate's new
     utterance.

4. **Session state:** one `InterviewState` instance per WebSocket
   connection, held server-side in memory for the session's lifetime (no
   need for persistence yet — that's a later "next step").

---

## 5. Phase 3 — Frontend (Next.js)

- Resume upload page (drag/drop, PDF/DOCX) + optional JD text box.
- Interview page:
  - Mic capture + VAD wired to the WebSocket client.
  - Live transcript panel (candidate's + agent's text, as it streams in).
  - Audio playback element for streamed TTS.
  - Visual state indicator: listening / thinking / speaking / interrupted.
- Summary page: renders the `session_summary` payload (scores per category,
  weak topics, overall feedback).

---

## 6. Explicitly Out of Scope for v1

- OCR for scanned/image resumes.
- Persisting `weak_topics` across sessions (JSON/SQLite) — later step.
- Running submitted code against test cases for DSA questions — later step.
- Multi-candidate/interviewer dashboards, auth, billing.

---

## 7. Build Order

1. Resume extraction + `resume_planner` + updated `question_gen` (Phase 1),
   testable via CLI/HTTP with no voice or frontend.
2. FastAPI WebSocket skeleton + Groq STT/TTS wiring, tested with a minimal
   HTML page before building the real Next.js frontend.
3. Client-side VAD + interrupt handling.
4. Full Next.js frontend polish (upload flow, transcript UI, summary page).

Build and validate each phase independently before moving to the next —
voice/interrupt bugs are much easier to debug once the resume→questions
pipeline is already known-good.
