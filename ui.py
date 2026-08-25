"""Small Streamlit interface for the Interview Prep Agent."""
import uuid

import streamlit as st

from graph import build_graph


st.set_page_config(page_title="Interview Prep Agent", page_icon="?", layout="centered")

st.markdown(
    """
    <style>
    [data-testid="stAppViewContainer"] { background: #f4f0e8; }
    [data-testid="stHeader"] { background: transparent; }
    .block-container { max-width: 760px; padding-top: 3rem; }
    h1, h2, h3 { color: #17231c; letter-spacing: -0.03em; }
    .eyebrow { color: #b44b2d; font-size: .76rem; font-weight: 700;
               letter-spacing: .14em; text-transform: uppercase; }
    .question { background: #17231c; color: #fffaf1; padding: 1.4rem;
                border-radius: 10px; font-size: 1.2rem; line-height: 1.5; }
    </style>
    """,
    unsafe_allow_html=True,
)


def reset_session() -> None:
    for key in ("graph", "config", "started"):
        st.session_state.pop(key, None)
    st.rerun()


def show_agent_error(error: Exception) -> None:
    """Show actionable API errors without exposing a framework traceback."""
    error_text = str(error)
    if "expired_api_key" in error_text or "AuthenticationError" in type(error).__name__:
        st.error("Groq rejected the API key.")
        st.info("Create a new Groq key, replace GROQ_API_KEY in .env, then restart Streamlit.")
    else:
        st.error(f"The interview could not continue: {error_text}")


st.markdown('<div class="eyebrow">Practice room / adaptive interview</div>', unsafe_allow_html=True)
st.title("Interview Prep Agent")
st.write("Give the coach a job description or a short list of topics. It will build a focused interview loop.")

if "started" not in st.session_state:
    with st.form("start_form"):
        source_text = st.text_area(
            "What are you preparing for?",
            placeholder="C++ fundamentals, OOP, DSA, Operating Systems...",
            height=130,
        )
        start = st.form_submit_button("Start interview", type="primary", use_container_width=True)

    if start:
        source_text = source_text.strip() or "C++ fundamentals, OOP, Data Structures, Algorithms, Operating Systems"
        try:
            st.session_state.graph = build_graph()
            st.session_state.config = {"configurable": {"thread_id": str(uuid.uuid4())}}
            mode = "jd" if len(source_text.split()) > 40 else "topics"
            st.session_state.graph.invoke(
                {"source_text": source_text, "mode": mode}, st.session_state.config
            )
        except Exception as error:
            show_agent_error(error)
        else:
            st.session_state.started = True
            st.rerun()
    st.stop()


graph = st.session_state.graph
config = st.session_state.config
snapshot = graph.get_state(config)
state = snapshot.values

if not snapshot.next:
    st.success("Interview complete")
    st.markdown(state.get("summary_report", "No summary available."))
    st.button("Start another interview", on_click=reset_session)
    st.stop()

st.caption(f"Category: {state.get('current_category', 'General')}")
st.markdown(f'<div class="question">{state["current_question"]}</div>', unsafe_allow_html=True)

evaluation = state.get("current_evaluation")
if evaluation:
    st.divider()
    st.subheader(f"Latest score: {evaluation['score']}/10")
    if evaluation.get("missing_points"):
        st.write("Missing points: " + ", ".join(evaluation["missing_points"]))
    st.write(evaluation.get("model_answer", ""))

with st.form("answer_form", clear_on_submit=True):
    answer = st.text_area("Your answer", height=170, placeholder="Think out loud. Partial answers are useful.")
    submitted = st.form_submit_button("Submit answer", type="primary", use_container_width=True)

if submitted:
    if not answer.strip():
        st.warning("Write an answer before submitting.")
    else:
        try:
            graph.update_state(config, {"current_answer": answer.strip()})
            graph.invoke(None, config)
        except Exception as error:
            show_agent_error(error)
        else:
            st.rerun()

st.button("Reset", on_click=reset_session)