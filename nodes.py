"""
Node functions for the Interview Prep Agent graph.
Each node takes the InterviewState and returns a partial state update (dict).
"""
import json
import re
from config import get_llm
from state import InterviewState

llm = get_llm(temperature=0.4)
llm_eval = get_llm(temperature=0.0)  # deterministic scoring


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM response, tolerating stray text/fences."""
    text = text.strip()
    text = re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object found in LLM output:\n{text}")
    return json.loads(match.group(0))


# ---------------------------------------------------------------------------
# 1. Planner
# ---------------------------------------------------------------------------
def planner_node(state: InterviewState) -> dict:
    prompt = f"""You are an interview coach. The input below is either a job description
or a study roadmap of topics. Break it into 3-6 interview CATEGORIES ordered by
a sensible learning/interview sequence (fundamentals before advanced).

Input:
\"\"\"{state['source_text']}\"\"\"

Respond ONLY with JSON: {{"categories": ["cat1", "cat2", ...]}}
No preamble, no markdown fences."""
    resp = llm.invoke(prompt)
    data = _extract_json(resp.content)
    categories = data.get("categories", [])[:6] or ["General"]

    return {
        "categories": categories,
        "category_index": 0,
        "current_category": categories[0],
        "weak_topics": [],
        "history": [],
        "questions_per_category": 3,
        "questions_asked_in_category": 0,
        "follow_up_count": 0,
        "session_complete": False,
    }


# ---------------------------------------------------------------------------
# 2. Question generator
# ---------------------------------------------------------------------------
def question_gen_node(state: InterviewState) -> dict:
    weak = state.get("weak_topics", [])
    weak_hint = f"The candidate has previously struggled with: {', '.join(weak)}. " \
                f"Bias toward these if relevant to the current category." if weak else ""

    prompt = f"""You are conducting a technical interview.
Current category: {state['current_category']}
{weak_hint}

Ask ONE clear, specific interview question for this category. Vary difficulty
(mix conceptual and applied/coding questions where relevant to the category).
Do not repeat earlier questions.

Previously asked in this session: {[h['question'] for h in state.get('history', [])]}

Respond ONLY with JSON: {{"question": "..."}}"""
    resp = llm.invoke(prompt)
    data = _extract_json(resp.content)

    return {
        "current_question": data["question"],
        "follow_up_count": 0,
    }


# ---------------------------------------------------------------------------
# 3. Evaluator
# ---------------------------------------------------------------------------
def evaluator_node(state: InterviewState) -> dict:
    prompt = f"""You are a strict but fair technical interviewer grading an answer.

Category: {state['current_category']}
Question: {state['current_question']}
Candidate's answer: \"\"\"{state['current_answer']}\"\"\"

Evaluate it. Respond ONLY with JSON in this exact shape:
{{
  "score": <int 0-10>,
  "correctness": <true/false>,
  "missing_points": ["...", "..."],
  "model_answer": "<concise ideal answer, 2-4 sentences>"
}}"""
    resp = llm_eval.invoke(prompt)
    evaluation = _extract_json(resp.content)

    record = {
        "category": state["current_category"],
        "question": state["current_question"],
        "answer": state["current_answer"],
        "score": evaluation["score"],
        "correctness": evaluation["correctness"],
        "missing_points": evaluation.get("missing_points", []),
        "model_answer": evaluation.get("model_answer", ""),
    }

    weak_topics = list(state.get("weak_topics", []))
    if evaluation["score"] < 6 and state["current_category"] not in weak_topics:
        weak_topics.append(state["current_category"])

    return {
        "current_evaluation": evaluation,
        "history": state.get("history", []) + [record],
        "weak_topics": weak_topics,
    }


# ---------------------------------------------------------------------------
# 4. Follow-up (used when score is low and follow-up budget remains)
# ---------------------------------------------------------------------------
def follow_up_node(state: InterviewState) -> dict:
    gaps = state["current_evaluation"].get("missing_points", [])
    prompt = f"""The candidate's answer to this question was weak:
Question: {state['current_question']}
Gaps identified: {gaps}

Ask ONE simpler, more targeted follow-up question that helps them demonstrate
understanding of just the missing piece. Keep it focused and easier than the original.

Respond ONLY with JSON: {{"question": "..."}}"""
    resp = llm.invoke(prompt)
    data = _extract_json(resp.content)

    return {
        "current_question": data["question"],
        "follow_up_count": state.get("follow_up_count", 0) + 1,
    }


# ---------------------------------------------------------------------------
# 5. Progress tracker (advances category/question counters, decides completion)
# ---------------------------------------------------------------------------
def advance_node(state: InterviewState) -> dict:
    asked = state.get("questions_asked_in_category", 0) + 1
    category_index = state["category_index"]
    categories = state["categories"]

    if asked >= state["questions_per_category"]:
        category_index += 1
        asked = 0

    if category_index >= len(categories):
        return {"session_complete": True}

    return {
        "questions_asked_in_category": asked,
        "category_index": category_index,
        "current_category": categories[category_index],
        "session_complete": False,
    }


# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------
def summary_node(state: InterviewState) -> dict:
    history = state.get("history", [])
    avg_score = sum(h["score"] for h in history) / len(history) if history else 0
    weak = state.get("weak_topics", [])

    lines = [
        "# Interview Session Summary",
        f"\nQuestions answered: {len(history)}",
        f"Average score: {avg_score:.1f}/10",
        f"Weak topics: {', '.join(weak) if weak else 'None — solid across the board'}",
        "\n## Per-question breakdown",
    ]
    for i, h in enumerate(history, 1):
        lines.append(
            f"\n**Q{i} [{h['category']}] (score {h['score']}/10)**\n"
            f"- Q: {h['question']}\n"
            f"- Your answer: {h['answer'][:200]}\n"
            f"- Model answer: {h['model_answer']}\n"
        )

    return {"summary_report": "\n".join(lines)}
