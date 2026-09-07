"""
Resume extraction module: reads PDF/DOCX files and uses Groq LLM to parse structured data.
"""
import io
import json
import re
from typing import Dict, Any
from pypdf import PdfReader
from docx import Document
from config import get_llm

llm = get_llm(temperature=0.2)


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM response, tolerating stray text/fences."""
    text = text.strip()
    text = re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object found in LLM output:\n{text}")
    return json.loads(match.group(0))


def extract_raw_text_from_pdf(file_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(file_bytes))
    text_chunks = []
    for page in reader.pages:
        txt = page.extract_text()
        if txt:
            text_chunks.append(txt)
    return "\n".join(text_chunks)


def extract_raw_text_from_docx(file_bytes: bytes) -> str:
    doc = Document(io.BytesIO(file_bytes))
    text_chunks = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(text_chunks)


def extract_resume_text(file_bytes: bytes, filename: str) -> str:
    filename_lower = filename.lower()
    if filename_lower.endswith(".pdf"):
        return extract_raw_text_from_pdf(file_bytes)
    elif filename_lower.endswith(".docx") or filename_lower.endswith(".doc"):
        return extract_raw_text_from_docx(file_bytes)
    else:
        try:
            return file_bytes.decode("utf-8")
        except Exception:
            raise ValueError("Unsupported file format. Please upload a PDF or DOCX file.")


def parse_resume_to_json(resume_text: str) -> Dict[str, Any]:
    prompt = f"""You are a resume parsing assistant. Analyze the raw text of the resume below and extract key structured information.

Resume Text:
\"\"\"{resume_text}\"\"\"

Respond ONLY with a single JSON object in this exact shape:
{{
  "skills": ["skill1", "skill2"],
  "projects": [
    {{"name": "...", "description": "...", "tech": ["..."]}}
  ],
  "experience": [
    {{"role": "...", "company": "...", "duration": "...", "highlights": ["..."]}}
  ],
  "education": [
    {{"degree": "...", "institution": "...", "year": "..."}}
  ]
}}
Do not add preamble or markdown code blocks."""

    resp = llm.invoke(prompt)
    return _extract_json(resp.content)
