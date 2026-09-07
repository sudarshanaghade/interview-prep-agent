"""
Builds the Interview Prep Agent as a LangGraph StateGraph.

Flow:
  (entry: resume_planner or planner) -> intro_node -> question_gen -> [PAUSE for user answer] -> evaluator
      -> (weak & budget left) -> follow_up -> [PAUSE] -> evaluator   (loop)
      -> (else) -> advance -> (new category) -> transition_node -> question_gen (loop)
                           -> (same category) -> question_gen      (loop)
                           -> (done) -> summary -> END
"""
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from state import InterviewState
from nodes import (
    planner_node,
    resume_planner_node,
    intro_node,
    question_gen_node,
    evaluator_node,
    follow_up_node,
    advance_node,
    transition_node,
    summary_node,
)

import os

MAX_LLM_CALLS_PER_SESSION = int(os.getenv("MAX_LLM_CALLS", "25"))
WEAK_SCORE_THRESHOLD = 6


def route_planner(state: InterviewState) -> str:
    if state.get("mode") == "resume":
        return "resume_planner"
    return "planner"


def route_after_evaluation(state: InterviewState) -> str:
    if state.get("llm_call_count", 0) >= MAX_LLM_CALLS_PER_SESSION:
        return "advance"
    score = state["current_evaluation"]["score"]
    max_fu = state.get("max_follow_ups", 2)
    if score < WEAK_SCORE_THRESHOLD and state.get("follow_up_count", 0) < max_fu:
        return "follow_up"
    return "advance"


def route_after_advance(state: InterviewState) -> str:
    if state.get("session_complete") or state.get("llm_call_count", 0) >= MAX_LLM_CALLS_PER_SESSION:
        return "summary"
    # If questions_asked_in_category == 0, we just moved to a new category → transition
    if state.get("questions_asked_in_category", 0) == 0:
        return "transition"
    return "question_gen"


def build_graph():
    graph = StateGraph(InterviewState)

    graph.add_node("planner", planner_node)
    graph.add_node("resume_planner", resume_planner_node)
    graph.add_node("intro", intro_node)
    graph.add_node("question_gen", question_gen_node)
    graph.add_node("evaluator", evaluator_node)
    graph.add_node("follow_up", follow_up_node)
    graph.add_node("advance", advance_node)
    graph.add_node("transition", transition_node)
    graph.add_node("summary", summary_node)

    graph.set_conditional_entry_point(
        route_planner,
        {"planner": "planner", "resume_planner": "resume_planner"}
    )

    # Both planners → intro greeting → first question
    graph.add_edge("planner", "intro")
    graph.add_edge("resume_planner", "intro")
    graph.add_edge("intro", "question_gen")
    graph.add_edge("question_gen", "evaluator")

    graph.add_conditional_edges(
        "evaluator", route_after_evaluation, {"follow_up": "follow_up", "advance": "advance"}
    )
    graph.add_edge("follow_up", "evaluator")

    graph.add_conditional_edges(
        "advance", route_after_advance,
        {"question_gen": "question_gen", "transition": "transition", "summary": "summary"}
    )
    graph.add_edge("transition", "question_gen")
    graph.add_edge("summary", END)

    # Pause execution right before evaluator so answer can be injected into state
    checkpointer = MemorySaver()
    compiled = graph.compile(checkpointer=checkpointer, interrupt_before=["evaluator"])
    return compiled
