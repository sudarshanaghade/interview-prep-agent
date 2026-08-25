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


class InterviewState(TypedDict):
    # Input
    source_text: str            # raw JD text OR topic roadmap text
    mode: str                   # "jd" or "topics"

    # Planning
    categories: List[str]       # e.g. ["OOP", "DSA", "OS"]
    category_index: int         # which category we're currently on

    # Per-question cycle
    current_category: str
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
