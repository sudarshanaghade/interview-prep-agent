"""
Builds the Interview Prep Agent as a LangGraph StateGraph.

Flow:
  planner -> question_gen -> [PAUSE for user answer] -> evaluator
      -> (weak & budget left) -> follow_up -> [PAUSE] -> evaluator   (loop)
      -> (else) -> advance -> (more left) -> question_gen            (loop)
                            -> (done) -> summary -> END
"""
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from state import InterviewState
from nodes import (
    planner_node,
    question_gen_node,
    evaluator_node,
    follow_up_node,
    advance_node,
    summary_node,
)

MAX_FOLLOW_UPS = 2
WEAK_SCORE_THRESHOLD = 6


def route_after_evaluation(state: InterviewState) -> str:
    score = state["current_evaluation"]["score"]
    if score < WEAK_SCORE_THRESHOLD and state.get("follow_up_count", 0) < MAX_FOLLOW_UPS:
        return "follow_up"
    return "advance"


def route_after_advance(state: InterviewState) -> str:
    return "summary" if state.get("session_complete") else "question_gen"


def build_graph():
    graph = StateGraph(InterviewState)

    graph.add_node("planner", planner_node)
    graph.add_node("question_gen", question_gen_node)
    graph.add_node("evaluator", evaluator_node)
    graph.add_node("follow_up", follow_up_node)
    graph.add_node("advance", advance_node)
    graph.add_node("summary", summary_node)

    graph.set_entry_point("planner")
    graph.add_edge("planner", "question_gen")
    graph.add_edge("question_gen", "evaluator")

    graph.add_conditional_edges(
        "evaluator", route_after_evaluation, {"follow_up": "follow_up", "advance": "advance"}
    )
    graph.add_edge("follow_up", "evaluator")

    graph.add_conditional_edges(
        "advance", route_after_advance, {"question_gen": "question_gen", "summary": "summary"}
    )
    graph.add_edge("summary", END)

    # Pause execution right before evaluator so the CLI/UI can inject the
    # user's typed/spoken answer into state before grading happens.
    checkpointer = MemorySaver()
    compiled = graph.compile(checkpointer=checkpointer, interrupt_before=["evaluator"])
    return compiled
