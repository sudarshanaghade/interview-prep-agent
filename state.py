"""
Shared state passed between LangGraph nodes.
"""
from typing import TypedDict, List, Dict, Optional


class QARecord(TypedDict):
    category: str
    question: str
    answer: str
    score: int
    correctness: bool
    missing_points: List[str]
    model_answer: str


class CategoryDict(TypedDict):
    category: str
    source: str
    reason: str


class InterviewState(TypedDict):
    # Input
    source_text: str            # raw JD text OR topic roadmap text
    mode: str                   # "resume", "jd", or "topics"
    resume_json: Optional[Dict] # Extracted resume structure (if mode == "resume")

    # Planning
    categories: List[Dict]      # List of CategoryDict
    category_index: int         # which category index we're currently on

    # Per-question cycle
    current_category: str       # Name of current category (string)
    current_category_info: Optional[Dict] # Full CategoryDict for current category
    current_question: str
    current_answer: str
    current_evaluation: Optional[Dict]

    # Adaptive logic
    weak_topics: List[str]
    follow_up_count: int        # follow-ups asked for current question (cap this)

    # Bookkeeping
    history: List[QARecord]
    questions_per_category: int
    questions_asked_in_category: int
    session_complete: bool
    summary_report: Optional[str]
    summary_data: Optional[Dict]      # Structured summary for frontend charts
    intro_message: Optional[str]      # One-time AI opening greeting
    transition_message: Optional[str] # Category-change bridging sentence
    llm_call_count: int               # Cumulative count of LLM calls in this session
    max_follow_ups: int               # Configurable max follow-up questions per weak answer
