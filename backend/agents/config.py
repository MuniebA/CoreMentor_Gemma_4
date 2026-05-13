"""Configuration for CoreMentor local AI and vector memory."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv() -> None:
        return None


load_dotenv()


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent


@dataclass(frozen=True)
class CoreMentorAISettings:
    """Environment-backed settings for the local agent mesh."""

    agent_mode: str
    ollama_base_url: str
    ollama_chat_model: str
    ollama_embedding_model: str
    ollama_vision_model: str
    ollama_temperature: float
    ollama_num_ctx: int
    ollama_keep_alive: str
    vision_enabled: bool
    vision_max_images: int
    vision_max_image_bytes: int
    chroma_persist_dir: Path
    chroma_student_collection: str
    chroma_career_collection: str
    uploads_dir: Path
    docling_enabled: bool
    chroma_enabled: bool
    llm_enabled: bool


def get_ai_settings() -> CoreMentorAISettings:
    """Load AI settings from environment with local-first defaults."""

    return CoreMentorAISettings(
        agent_mode=_env("COREMENTOR_AGENT_MODE", "hybrid").lower(),
        ollama_base_url=_env("OLLAMA_BASE_URL", "http://localhost:11434"),
        ollama_chat_model=_env("COREMENTOR_OLLAMA_MODEL", "gemma4:4b"),
        ollama_embedding_model=_env(
            "COREMENTOR_OLLAMA_EMBED_MODEL",
            "nomic-embed-text",
        ),
        ollama_vision_model=_env("COREMENTOR_OLLAMA_VISION_MODEL", "moondream"),
        ollama_temperature=_env_float("COREMENTOR_OLLAMA_TEMPERATURE", 0.2),
        ollama_num_ctx=_env_int("COREMENTOR_OLLAMA_NUM_CTX", 4096),
        ollama_keep_alive=_env("COREMENTOR_OLLAMA_KEEP_ALIVE", "10m"),
        vision_enabled=_env_bool("COREMENTOR_VISION_ENABLED", True),
        vision_max_images=_env_int("COREMENTOR_VISION_MAX_IMAGES", 3),
        vision_max_image_bytes=_env_int("COREMENTOR_VISION_MAX_IMAGE_BYTES", 6_000_000),
        chroma_persist_dir=_path_env("CHROMA_PERSIST_DIR", "backend/storage/chroma"),
        chroma_student_collection=_env(
            "CHROMA_STUDENT_PATTERNS_COLLECTION",
            "student_patterns",
        ),
        chroma_career_collection=_env("CHROMA_CAREER_DATA_COLLECTION", "career_data"),
        uploads_dir=_path_env("COREMENTOR_UPLOADS_DIR", "backend/uploads"),
        docling_enabled=_env_bool("COREMENTOR_DOCLING_ENABLED", True),
        chroma_enabled=_env_bool("COREMENTOR_CHROMA_ENABLED", True),
        llm_enabled=_env_bool("COREMENTOR_LLM_ENABLED", True),
    )


def _env(name: str, default: str) -> str:
    return os.getenv(name, default).strip() or default


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _path_env(name: str, default: str) -> Path:
    value = _env(name, default)
    path = Path(value)
    if not path.is_absolute():
        path = PROJECT_DIR / path
    return path
