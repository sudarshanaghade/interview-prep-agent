"""
Node functions for the Interview Prep Agent graph.
Each node takes the InterviewState and returns a partial state update (dict).
"""
import json
import re
from typing import Dict, Any
from config import get_llm
from state import InterviewState, CategoryDict

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
# 1a. Legacy Planner (JD / Topics)
# ---------------------------------------------------------------------------
def planner_node(state: InterviewState) -> dict:
    prompt = f"""You are an interview coach. The input below is either a job description
or a study roadmap of topics. Break it into 3-6 interview CATEGORIES ordered by
a sensible learning/interview sequence (fundamentals before advanced).

Input:
\"\"\"{state.get('source_text', '')}\"\"\"

Respond ONLY with JSON:
{{
  "categories": [
    {{"category": "Category Name", "source": "general", "reason": "Fundamental topic from source"}}
  ]
}}
No preamble, no markdown fences."""
    resp = llm.invoke(prompt)
    data = _extract_json(resp.content)
    raw_cats = data.get("categories", [])[:6]
    
    categories: list[CategoryDict] = []
    for item in raw_cats:
        if isinstance(item, str):
            categories.append({"category": item, "source": "general", "reason": "Standard topic"})
        elif isinstance(item, dict):
            categories.append({
                "category": item.get("category", "General"),
                "source": item.get("source", "general"),
                "reason": item.get("reason", "Topic from source text")
            })

    if not categories:
        categories = [{"category": "General Technical", "source": "general", "reason": "Default category"}]

    first_cat = categories[0]
    return {
        "categories": categories,
        "category_index": 0,
        "current_category": first_cat["category"],
        "current_category_info": first_cat,
        "weak_topics": [],
        "history": [],
        "questions_per_category": state.get("questions_per_category", 2),
        "questions_asked_in_category": 0,
        "follow_up_count": 0,
        "session_complete": False,
        "llm_call_count": state.get("llm_call_count", 0) + 1,
    }


# ---------------------------------------------------------------------------
# 1b. Resume Planner Node
# ---------------------------------------------------------------------------
def resume_planner_node(state: InterviewState) -> dict:
    resume = state.get("resume_json") or {}
    jd_text = state.get("source_text", "").strip()

    prompt = f"""You are an expert technical interviewer creating a resume-grounded interview plan.
Analyze the candidate's resume structure and optional Job Description.

Resume JSON:
{json.dumps(resume, indent=2)}

Job Description / Goal:
\"\"\"{jd_text if jd_text else "General Technical Role"}\"\"\"

Generate 3-6 tailored interview categories. For EACH category, tag it with its source and reason:
- source can be a project name (e.g. "project:Project Name"), "experience:Company Name", "skill:Skill Name", or "gap" (if JD requires a skill missing from resume).
- reason explains why this category was chosen based on specific claims in the resume or JD gaps.

Respond ONLY with JSON in this exact shape:
{{
  "categories": [
    {{
      "category": "Category / Topic Name",
      "source": "project:Ecommerce Platform",
      "reason": "Claims handling 10k RPS with Redis & Golang"
    }}
  ]
}}
No preamble, no markdown fences."""

    resp = llm.invoke(prompt)
    data = _extract_json(resp.content)
    raw_cats = data.get("categories", [])[:6]

    categories: list[CategoryDict] = []
    for item in raw_cats:
        if isinstance(item, dict) and "category" in item:
            categories.append({
                "category": item["category"],
                "source": item.get("source", "resume"),
                "reason": item.get("reason", "Extracted from candidate resume")
            })
        elif isinstance(item, str):
            categories.append({"category": item, "source": "resume", "reason": "Resume topic"})

    if not categories:
        categories = [{"category": "Technical Overview", "source": "resume", "reason": "General resume evaluation"}]

    first_cat = categories[0]
    return {
        "categories": categories,
        "category_index": 0,
        "current_category": first_cat["category"],
        "current_category_info": first_cat,
        "weak_topics": [],
        "history": [],
        "questions_per_category": state.get("questions_per_category", 2),
        "questions_asked_in_category": 0,
        "follow_up_count": 0,
        "session_complete": False,
        "llm_call_count": state.get("llm_call_count", 0) + 1,
    }


# ---------------------------------------------------------------------------
# 2. Question generator
# ---------------------------------------------------------------------------
def question_gen_node(state: InterviewState) -> dict:
    weak = state.get("weak_topics", [])
    weak_hint = f"The candidate previously struggled with: {', '.join(weak)}. Bias toward these if relevant." if weak else ""

    cat_info = state.get("current_category_info") or {}
    source_tag = cat_info.get("source", "")
    reason_tag = cat_info.get("reason", "")

    resume_context = ""
    if state.get("mode") == "resume" and state.get("resume_json"):
        resume = state["resume_json"]
        # Extract matching snippet if source_tag points to a specific project or experience
        relevant_snippet = {}
        if ":" in source_tag:
            src_type, src_val = source_tag.split(":", 1)
            src_val_lower = src_val.lower().strip()
            if src_type == "project":
                for proj in resume.get("projects", []):
                    if src_val_lower in proj.get("name", "").lower():
                        relevant_snippet["project"] = proj
                        break
            elif src_type == "experience":
                for exp in resume.get("experience", []):
                    if src_val_lower in exp.get("company", "").lower() or src_val_lower in exp.get("role", "").lower():
                        relevant_snippet["experience"] = exp
                        break
        if not relevant_snippet:
            relevant_snippet = {
                "skills": resume.get("skills", []),
                "projects": [p.get("name") for p in resume.get("projects", [])],
                "experience": [f"{e.get('role')} at {e.get('company')}" for e in resume.get("experience", [])]
            }

        resume_context = f"\nResume Snippet for this Category:\nSource Tag: {source_tag}\nReason Tag: {reason_tag}\nSnippet Details: {json.dumps(relevant_snippet)}"

    prompt = f"""You are conducting a technical interview.
Current category: {state['current_category']}
Category Context: {reason_tag} (Source: {source_tag})
{weak_hint}
{resume_context}

Ask ONE clear, specific interview question for this category.
If this category references a specific project or experience from the resume, ask directly about their specific implementation details, choices, or challenges (e.g. "You mentioned using Redis for caching in [Project] — why Redis over an in-memory dictionary there?").

Previously asked questions in this session:
{[h['question'] for h in state.get('history', [])]}

Respond ONLY with JSON: {{"question": "..."}}"""

    resp = llm.invoke(prompt)
    data = _extract_json(resp.content)

    return {
        "current_question": data["question"],
        "follow_up_count": 0,
        "llm_call_count": state.get("llm_call_count", 0) + 1,
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
        "llm_call_count": state.get("llm_call_count", 0) + 1,
    }


# ---------------------------------------------------------------------------
# 4. Follow-up
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
        "llm_call_count": state.get("llm_call_count", 0) + 1,
    }


# ---------------------------------------------------------------------------
# 5. Progress tracker
# ---------------------------------------------------------------------------
def advance_node(state: InterviewState) -> dict:
    asked = state.get("questions_asked_in_category", 0) + 1
    category_index = state["category_index"]
    categories = state["categories"]

    if asked >= state.get("questions_per_category", 2):
        category_index += 1
        asked = 0

    if category_index >= len(categories):
        return {"session_complete": True}

    next_cat = categories[category_index]
    cat_name = next_cat["category"] if isinstance(next_cat, dict) else next_cat

    return {
        "questions_asked_in_category": asked,
        "category_index": category_index,
        "current_category": cat_name,
        "current_category_info": next_cat if isinstance(next_cat, dict) else {"category": cat_name, "source": "general", "reason": ""},
        "session_complete": False,
    }


# ---------------------------------------------------------------------------
# 5b. Intro Node — one-time opening greeting (fast template, 0 LLM latency)
# ---------------------------------------------------------------------------
def intro_node(state: InterviewState) -> dict:
    categories = state.get("categories", [])
    cat_names = [c["category"] if isinstance(c, dict) else c for c in categories]
    mode = state.get("mode", "jd")
    resume = state.get("resume_json") or {}

    topics_str = ", ".join(cat_names) if cat_names else "your background and technical experience"

    if mode == "resume" and resume:
        exp = resume.get("experience", [])
        name_hint = f" Based on your background with {exp[0].get('company')}," if (exp and exp[0].get("company")) else ""
        intro = (
            f"Hello! Welcome to your mock interview.{name_hint} "
            f"Today we'll be covering {topics_str}. "
            f"I'll ask questions one at a time — answer naturally when you're ready. Let's begin!"
        )
    else:
        intro = (
            f"Hello! Welcome to your mock interview. "
            f"Today we'll be covering {topics_str}. "
            f"I'll ask questions one at a time — answer naturally when you're ready. Let's begin!"
        )

    return {"intro_message": intro}


# ---------------------------------------------------------------------------
# 5c. Transition Node — bridging sentence between categories (fast template, 0 LLM latency)
# ---------------------------------------------------------------------------
def transition_node(state: InterviewState) -> dict:
    import random
    cat_info = state.get("current_category_info") or {}
    cat_name = state.get("current_category", "the next topic")
    source = cat_info.get("source", "")

    if source.startswith("project:"):
        proj_name = source.split(":", 1)[1].strip()
        templates = [
            f"Great. Let's shift our focus to {cat_name} and your work on {proj_name}.",
            f"Thanks. Now I'd like to dive into {cat_name}, specifically regarding {proj_name}.",
            f"Moving on, let's explore {cat_name} from your project {proj_name}.",
        ]
    elif source.startswith("experience:"):
        comp_name = source.split(":", 1)[1].strip()
        templates = [
            f"Got it. Let's move on to {cat_name} and your experience at {comp_name}.",
            f"Thanks. Now let's discuss {cat_name} in the context of your role at {comp_name}.",
            f"Next up, I'd like to ask about {cat_name} from your time at {comp_name}.",
        ]
    else:
        templates = [
            f"Great. Let's shift gears and move on to {cat_name}.",
            f"Thanks for that. Next, let's explore {cat_name}.",
            f"Alright, moving right along to {cat_name}.",
        ]

    return {"transition_message": random.choice(templates)}


# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------
def summary_node(state: InterviewState) -> dict:
    history = state.get("history", [])
    avg_score = sum(h["score"] for h in history) / len(history) if history else 0
    weak = state.get("weak_topics", [])

    lines = [
        "# Interview Session Summary",
        f"\n**Questions Answered:** {len(history)}",
        f"**Average Score:** {avg_score:.1f}/10",
        f"**Weak Topics:** {', '.join(weak) if weak else 'None — solid performance overall'}",
        "\n---",
        "\n## Detailed Breakdown",
    ]
    for i, h in enumerate(history, 1):
        lines.append(
            f"\n### Q{i} [{h['category']}] — Score: {h['score']}/10\n"
            f"**Question:** {h['question']}\n\n"
            f"**Your Answer:** {h['answer']}\n\n"
            f"**Model Answer:** {h['model_answer']}\n"
        )
        if h.get("missing_points"):
            lines.append(f"**Key Gaps:** {', '.join(h['missing_points'])}\n")

    # Build structured data for frontend charts
    unique_cats = list(dict.fromkeys(h["category"] for h in history))
    category_breakdown = []
    for cat in unique_cats:
        cat_records = [h for h in history if h["category"] == cat]
        cat_avg = sum(r["score"] for r in cat_records) / len(cat_records) if cat_records else 0
        category_breakdown.append({
            "name": cat,
            "avg_score": round(cat_avg, 1),
            "questions_count": len(cat_records),
            "is_weak": cat in weak,
            "records": cat_records,
        })

    summary_data = {
        "total_questions": len(history),
        "average_score": round(avg_score, 1),
        "weak_topics": weak,
        "category_breakdown": category_breakdown,
    }

    return {
        "summary_report": "\n".join(lines),
        "summary_data": summary_data,
    }
