"""
Configuration and Groq LLM client setup for the Interview Prep Agent.
"""
import os
from langchain_groq import ChatGroq
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError(
        "GROQ_API_KEY not found. Create a .env file with: GROQ_API_KEY=your_key_here"
    )

# Fast + strong model for generation & evaluation.
# Swap to a smaller model (e.g. "llama-3.1-8b-instant") for cheaper/faster follow-ups.
MODEL_NAME = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

def get_llm(temperature: float = 0.4) -> ChatGroq:
    """Return a configured Groq chat model."""
    return ChatGroq(
        model=MODEL_NAME,
        temperature=temperature,
        api_key=GROQ_API_KEY,
    )
