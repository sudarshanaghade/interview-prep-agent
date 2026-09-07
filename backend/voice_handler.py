"""
Voice processing module: Groq STT (Whisper Large v3 Turbo) and gTTS audio generation.
"""
import io
import re
import base64
import os
from gtts import gTTS
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

groq_api_key = os.getenv("GROQ_API_KEY")
if not groq_api_key:
    raise ValueError("GROQ_API_KEY environment variable is required")

groq_client = Groq(api_key=groq_api_key)


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe audio using Groq Whisper Large v3 Turbo."""
    if not audio_bytes or len(audio_bytes) < 100:
        print(f"[STT] Audio bytes too small ({len(audio_bytes) if audio_bytes else 0} bytes), skipping.")
        return ""

    print(f"[STT] Sending {len(audio_bytes)} bytes ({filename}) to Groq Whisper Large v3 Turbo...")
    try:
        response = groq_client.audio.transcriptions.create(
            file=(filename, audio_bytes),
            model="whisper-large-v3-turbo",
            response_format="json",
            language="en"
        )
        text = response.text.strip()
        print(f"[STT] Transcription succeeded: '{text}'")
        return text
    except Exception as e:
        print(f"[STT Error] Groq STT failed: {e}")
        raise e


def split_text_into_sentences(text: str) -> list[str]:
    """Split text into sentences for sentence-level TTS chunking."""
    if not text:
        return []
    # Split on sentence boundaries (period, question mark, exclamation mark followed by space or newline)
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in sentences if s.strip()]


def text_to_speech_base64(text: str) -> str:
    """Convert text to speech MP3 bytes encoded in Base64 using gTTS."""
    if not text.strip():
        return ""

    fp = io.BytesIO()
    tts = gTTS(text=text, lang='en', slow=False)
    tts.write_to_fp(fp)
    fp.seek(0)
    audio_bytes = fp.read()
    return base64.b64encode(audio_bytes).decode('utf-8')
