# Interview Prep Agent (LangGraph + Groq)

Adaptive mock-interview agent. Feed it a JD or a topic roadmap (e.g. your
C++/OOP/DSA/OS prep list), and it asks questions one at a time, scores your
answers, drills into weak spots with follow-ups, and gives a session summary.

## Setup

```bash
cd interview-prep-agent
pip install -r requirements.txt
# Windows PowerShell: Copy-Item .env.example .env
# macOS/Linux: cp .env.example .env
# edit .env and paste your real GROQ_API_KEY
```

## Run

```bash
python app.py
```

For the small browser UI, run:

```bash
streamlit run ui.py
```

Streamlit opens the app at `http://localhost:8501`.

Paste your topic list (or a JD) when prompted, end input with a blank line,
then answer each question as it appears.

## How it works

- `state.py` — the shared `InterviewState` passed between graph nodes.
- `nodes.py` — six node functions: planner, question_gen, evaluator,
  follow_up, advance, summary. Each one calls Groq via `langchain-groq` and
  expects strict JSON back (parsed defensively in `_extract_json`).
- `graph.py` — wires the nodes into a `StateGraph`, with conditional edges:
  - after `evaluator`: score < 6 and follow-up budget left → `follow_up`,
    else → `advance`
  - after `advance`: more categories left → back to `question_gen`,
    else → `summary` → `END`
  - `interrupt_before=["evaluator"]` pauses the graph so the CLI (or a future
    UI) can inject the user's answer into state before grading runs.
- `app.py` — CLI driver: prints each question, collects input, resumes the
  graph, prints the score/feedback, repeats until the graph reaches `END`.

## Next steps to extend it

1. **Streamlit UI** — replace the `input()`/`print()` loop in `app.py` with
   `st.chat_input`/`st.chat_message`, reusing the exact same graph.
2. **Speech input** — swap `input("Your answer: ")` for a recording step +
   Groq's hosted `whisper-large-v3` transcription call.
3. **Code questions** — for DSA-heavy categories, let the evaluator node run
   submitted code against test cases (subprocess/Docker) instead of relying
   purely on LLM judgment of correctness.
4. **Persistence** — `weak_topics` currently resets each run. Write it to a
   local JSON/SQLite file keyed by category, so each new session starts
   biased toward last time's gaps.
5. **Model tuning** — `evaluator_node` uses temperature 0 for consistent
   scoring; `question_gen_node`/`follow_up_node` use 0.4 for variety. Try
   `llama-3.1-8b-instant` for the cheaper/faster nodes if you want lower
   latency during rapid-fire practice.
