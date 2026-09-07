"""
FastAPI application for AI Interview Platform.
Provides REST endpoints for resume uploading / session init, and WebSocket for real-time interruptible voice interviews.
"""
import os
import time
import uuid
import base64
import asyncio
from typing import Dict, Any, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, Form, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from resume_extract import extract_resume_text, parse_resume_to_json
from graph import build_graph
from backend.voice_handler import transcribe_audio, text_to_speech_base64, split_text_into_sentences
from backend.database import init_db, get_db, User
from backend.auth import hash_password, verify_password, create_access_token, get_current_user

# In-memory session store with TTL tracking
sessions: Dict[str, Dict[str, Any]] = {}
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", str(60 * 60)))  # 1 hour default


async def cleanup_sessions():
    """Background task to periodically purge inactive sessions from memory."""
    while True:
        await asyncio.sleep(60)
        now = time.time()
        expired = [
            sid for sid, s in list(sessions.items())
            if now - s.get("last_active", s.get("created_at", now)) > SESSION_TTL_SECONDS
        ]
        for sid in expired:
            sessions.pop(sid, None)
        if expired:
            print(f"[cleanup] Evicted {len(expired)} expired session(s). Active sessions: {len(sessions)}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize PostgreSQL tables
    init_db()
    cleanup_task = asyncio.create_task(cleanup_sessions())
    yield
    cleanup_task.cancel()


app = FastAPI(title="AI Interview Platform API", version="1.0.0", lifespan=lifespan)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows Next.js frontend on localhost:3000
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AuthRequest(BaseModel):
    email: str
    password: str


class StartSessionRequest(BaseModel):
    source_text: str
    mode: str = "jd"  # "jd" or "topics"
    questions_per_category: int = Field(default=2, ge=1, le=5)
    max_follow_ups: int = Field(default=2, ge=0, le=3)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "ai-interview-platform-backend"}


@app.post("/api/auth/register")
def register_user(req: AuthRequest, db: Session = Depends(get_db)):
    """Register a new user with email and password."""
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email address is required")
    if not req.password or len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    hashed_pw = hash_password(req.password)
    user = User(email=email, hashed_password=hashed_pw)
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.email, "uid": user.id})
    return {
        "success": True,
        "token": token,
        "user": {"id": user.id, "email": user.email}
    }


@app.post("/api/auth/login")
def login_user(req: AuthRequest, db: Session = Depends(get_db)):
    """Authenticate user with email and password and return JWT token."""
    email = req.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": user.email, "uid": user.id})
    return {
        "success": True,
        "token": token,
        "user": {"id": user.id, "email": user.email}
    }


@app.get("/api/auth/me")
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Get authenticated user profile."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "created_at": str(current_user.created_at)
    }



@app.post("/api/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    job_description: Optional[str] = Form(None),
    questions_per_category: int = Form(2),
    max_follow_ups: int = Form(2),
):
    """
    Extract resume text, parse to JSON, initialize LangGraph interview state,
    run graph to generate the first question, and return initial session data.
    """
    try:
        file_bytes = await file.read()
        resume_text = extract_resume_text(file_bytes, file.filename)
        resume_json = parse_resume_to_json(resume_text)

        session_id = str(uuid.uuid4())
        graph = build_graph()
        config = {"configurable": {"thread_id": session_id}}

        initial_state = {
            "source_text": job_description or "",
            "mode": "resume",
            "resume_json": resume_json,
            "categories": [],
            "category_index": 0,
            "current_category": "",
            "current_category_info": None,
            "current_question": "",
            "current_answer": "",
            "current_evaluation": None,
            "weak_topics": [],
            "follow_up_count": 0,
            "history": [],
            "questions_per_category": max(1, min(5, int(questions_per_category))),
            "questions_asked_in_category": 0,
            "session_complete": False,
            "summary_report": None,
            "summary_data": None,
            "intro_message": None,
            "transition_message": None,
            "llm_call_count": 0,
            "max_follow_ups": max(0, min(3, int(max_follow_ups))),
        }

        # Run graph through planner -> question_gen until interrupt_before=["evaluator"]
        # Executed off the main event loop to avoid blocking server
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(None, graph.invoke, initial_state, config)

        now = time.time()
        sessions[session_id] = {
            "graph": graph,
            "config": config,
            "state": res,
            "interrupted": False,
            "mode": "resume",
            "resume_json": resume_json,
            "created_at": now,
            "last_active": now,
        }

        return {
            "session_id": session_id,
            "resume_json": resume_json,
            "categories": res.get("categories", []),
            "current_category": res.get("current_category", ""),
            "initial_question": res.get("current_question", "")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process resume: {str(e)}")


@app.post("/api/start-session")
async def start_session(req: StartSessionRequest):
    """
    Start a standard JD / topics interview session without resume upload.
    """
    try:
        session_id = str(uuid.uuid4())
        graph = build_graph()
        config = {"configurable": {"thread_id": session_id}}

        initial_state = {
            "source_text": req.source_text,
            "mode": req.mode,
            "resume_json": None,
            "categories": [],
            "category_index": 0,
            "current_category": "",
            "current_category_info": None,
            "current_question": "",
            "current_answer": "",
            "current_evaluation": None,
            "weak_topics": [],
            "follow_up_count": 0,
            "history": [],
            "questions_per_category": max(1, min(5, req.questions_per_category)),
            "questions_asked_in_category": 0,
            "session_complete": False,
            "summary_report": None,
            "summary_data": None,
            "intro_message": None,
            "transition_message": None,
            "llm_call_count": 0,
            "max_follow_ups": max(0, min(3, req.max_follow_ups)),
        }

        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(None, graph.invoke, initial_state, config)

        now = time.time()
        sessions[session_id] = {
            "graph": graph,
            "config": config,
            "state": res,
            "interrupted": False,
            "mode": req.mode,
            "resume_json": None,
            "created_at": now,
            "last_active": now,
        }

        return {
            "session_id": session_id,
            "categories": res.get("categories", []),
            "current_category": res.get("current_category", ""),
            "initial_question": res.get("current_question", "")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start session: {str(e)}")


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    """Fetch current session state summary and metadata."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    state = session["state"]
    return {
        "session_id": session_id,
        "mode": session["mode"],
        "resume_json": session["resume_json"],
        "categories": state.get("categories", []),
        "category_index": state.get("category_index", 0),
        "current_category": state.get("current_category", ""),
        "current_question": state.get("current_question", ""),
        "history": state.get("history", []),
        "weak_topics": state.get("weak_topics", []),
        "session_complete": state.get("session_complete", False),
        "summary_report": state.get("summary_report", None),
        "summary_data": state.get("summary_data", None),
    }


@app.websocket("/ws/interview/{session_id}")
async def websocket_interview(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint managing real-time interview interactions.
    Handles STT audio input, graph step execution, sentence-level TTS chunking,
    and interruption signals.
    """
    await websocket.accept()

    session = sessions.get(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "Invalid session ID or session expired."})
        await asyncio.sleep(0.1)
        await websocket.close(code=1008)
        return

    graph = session["graph"]
    config = session["config"]
    current_state = session["state"]

    # Send initial initialization payload
    await websocket.send_json({
        "type": "session_init",
        "categories": current_state.get("categories", []),
        "current_category": current_state.get("current_category", ""),
        "current_question": current_state.get("current_question", ""),
        "session_complete": current_state.get("session_complete", False)
    })

    async def tts_and_send(text: str, msg_type: str = "audio_chunk"):
        """TTS a text string sentence by sentence, respecting interrupts."""
        if not text:
            return
        sentences = split_text_into_sentences(text)
        for sentence in sentences:
            if session.get("interrupted"):
                break
            try:
                audio_b64 = text_to_speech_base64(sentence)
                await websocket.send_json({
                    "type": msg_type,
                    "data": audio_b64,
                    "sentence": sentence
                })
                await asyncio.sleep(0.05)
            except Exception as e:
                print(f"TTS Error: {e}")

    # --- Stream intro greeting (if present) ---
    intro_msg = current_state.get("intro_message", "")
    if intro_msg:
        await websocket.send_json({"type": "status", "status": "speaking"})
        await websocket.send_json({
            "type": "transcript",
            "speaker": "interviewer",
            "text": intro_msg
        })
        await tts_and_send(intro_msg)

    # --- Stream initial question ---
    initial_q = current_state.get("current_question", "")
    if initial_q:
        await websocket.send_json({"type": "status", "status": "speaking"})
        await websocket.send_json({
            "type": "transcript",
            "speaker": "interviewer",
            "text": initial_q
        })
        await tts_and_send(initial_q)

    await websocket.send_json({"type": "status", "status": "listening"})

    async def keepalive(ws: WebSocket):
        """Send periodic pings to keep WebSocket alive across proxy/NAT timeouts."""
        try:
            while True:
                await asyncio.sleep(20)
                await ws.send_json({"type": "ping"})
        except (asyncio.CancelledError, Exception):
            pass

    ping_task = asyncio.create_task(keepalive(websocket))

    try:
        while True:
            data = await websocket.receive_json()
            session["last_active"] = time.time()
            msg_type = data.get("type")

            if msg_type == "interrupt":
                session["interrupted"] = True
                await websocket.send_json({"type": "status", "status": "interrupted"})
                continue

            elif msg_type in ("audio_chunk", "text_answer"):
                session["interrupted"] = False
                answer_text = ""

                if msg_type == "audio_chunk":
                    await websocket.send_json({"type": "status", "status": "transcribing"})
                    audio_b64 = data.get("data", "")
                    filename = data.get("filename", "audio.webm")
                    print(f"[WS] Received audio_chunk: {len(audio_b64)} b64 chars, filename: {filename}")
                    try:
                        audio_bytes = base64.b64decode(audio_b64)
                        print(f"[WS] Decoded {len(audio_bytes)} audio bytes for session {session_id}")
                        answer_text = transcribe_audio(audio_bytes, filename=filename)
                    except Exception as e:
                        print(f"[WS Error] Transcription exception: {e}")
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Audio transcription error: {str(e)}"
                        })
                        await websocket.send_json({"type": "status", "status": "listening"})
                        continue

                    if not answer_text or len(answer_text.strip()) == 0:
                        print(f"[WS Warning] Speech not recognized for session {session_id}")
                        await websocket.send_json({
                            "type": "error",
                            "message": "Speech not recognized or mic silent. Please speak clearly."
                        })
                        await websocket.send_json({"type": "status", "status": "listening"})
                        continue

                    await websocket.send_json({
                        "type": "transcript",
                        "speaker": "candidate",
                        "text": answer_text
                    })
                else:
                    answer_text = data.get("text", "")
                    await websocket.send_json({
                        "type": "transcript",
                        "speaker": "candidate",
                        "text": answer_text
                    })

                # Inject candidate answer into LangGraph and resume execution off the main event loop
                await websocket.send_json({"type": "status", "status": "thinking"})
                try:
                    session["last_active"] = time.time()
                    loop = asyncio.get_running_loop()

                    await loop.run_in_executor(
                        None, graph.update_state, config, {"current_answer": answer_text}
                    )

                    def _run_graph():
                        latest = current_state
                        for event in graph.stream(None, config, stream_mode="values"):
                            latest = event
                        return latest

                    latest_state = await loop.run_in_executor(None, _run_graph)

                    session["state"] = latest_state
                    current_state = latest_state

                    # Send evaluation if available
                    eval_data = current_state.get("current_evaluation")
                    if eval_data:
                        await websocket.send_json({
                            "type": "evaluation",
                            "evaluation": eval_data
                        })

                    # Check if session is complete
                    if current_state.get("session_complete"):
                        await websocket.send_json({
                            "type": "session_summary",
                            "summary": current_state.get("summary_report"),
                            "summary_data": current_state.get("summary_data"),
                            "history": current_state.get("history", [])
                        })
                        await websocket.send_json({"type": "status", "status": "completed"})
                    else:
                        # --- Handle category transition message ---
                        transition_msg = current_state.get("transition_message", "")
                        if transition_msg:
                            await websocket.send_json({
                                "type": "transition",
                                "message": transition_msg,
                                "next_category": current_state.get("current_category", "")
                            })
                            await websocket.send_json({"type": "status", "status": "speaking"})
                            await websocket.send_json({
                                "type": "transcript",
                                "speaker": "interviewer",
                                "text": transition_msg
                            })
                            await tts_and_send(transition_msg)
                            # Clear transition_message off-thread so it doesn't repeat on next turn
                            await loop.run_in_executor(
                                None, graph.update_state, config, {"transition_message": None}
                            )

                        # --- Stream next question ---
                        next_q = current_state.get("current_question", "")
                        await websocket.send_json({
                            "type": "question",
                            "text": next_q,
                            "category": current_state.get("current_category", "")
                        })
                        await websocket.send_json({"type": "status", "status": "speaking"})
                        await websocket.send_json({
                            "type": "transcript",
                            "speaker": "interviewer",
                            "text": next_q
                        })
                        await tts_and_send(next_q)
                        await websocket.send_json({"type": "status", "status": "listening"})

                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Graph execution error: {str(e)}"
                    })
                    await websocket.send_json({"type": "status", "status": "listening"})

    except WebSocketDisconnect:
        print(f"WebSocket disconnected for session {session_id}")
        if session_id in sessions:
            # Mark for fast cleanup within 5 minutes of disconnect
            sessions[session_id]["last_active"] = time.time() - SESSION_TTL_SECONDS + 300
    except Exception as e:
        print(f"WebSocket session error: {e}")
    finally:
        ping_task.cancel()
