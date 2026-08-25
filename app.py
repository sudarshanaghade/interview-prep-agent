"""
CLI entry point for the Interview Prep Agent.

Usage:
    python app.py

Paste a job description OR your topic roadmap when prompted, then answer
each question as it's asked. Type answers directly; wiring in speech-to-text
(e.g. Groq's whisper-large-v3) later just means swapping the `input()` call.
"""
import uuid
from graph import build_graph

def main():
    print("=== Interview Prep Agent ===\n")
    print("Paste a job description, or a topic roadmap (e.g. 'C++ fundamentals, OOP, DSA, OS').")
    print("Finish input with an empty line:\n")

    lines = []
    while True:
        line = input()
        if not line.strip():
            break
        lines.append(line)
    source_text = "\n".join(lines).strip()

    if not source_text:
        source_text = "C++ fundamentals, OOP, Data Structures, Algorithms, Operating Systems"
        print(f"(No input given — defaulting to: {source_text})\n")

    mode = "jd" if len(source_text.split()) > 40 else "topics"

    graph = build_graph()
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}

    initial_state = {"source_text": source_text, "mode": mode}
    graph.invoke(initial_state, config)

    q_num = 0
    while True:
        snapshot = graph.get_state(config)

        if not snapshot.next:  # graph reached END
            break

        state = snapshot.values
        q_num += 1
        print(f"\n--- [{state['current_category']}] Question {q_num} ---")
        print(state["current_question"])
        answer = input("\nYour answer: ")

        graph.update_state(config, {"current_answer": answer})
        graph.invoke(None, config)

        state = graph.get_state(config).values
        ev = state["current_evaluation"]
        print(f"\nScore: {ev['score']}/10  |  Correct: {ev['correctness']}")
        if ev.get("missing_points"):
            print(f"Missing: {', '.join(ev['missing_points'])}")
        print(f"Model answer: {ev['model_answer']}")

    final_state = graph.get_state(config).values
    print("\n" + final_state["summary_report"])


if __name__ == "__main__":
    main()
