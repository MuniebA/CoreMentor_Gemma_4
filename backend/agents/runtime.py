"""Runtime adapters for Ollama, ChromaDB, and Docling."""

from __future__ import annotations

import base64
import json
import mimetypes
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib import request as urlrequest
from urllib.error import URLError

from agents.config import CoreMentorAISettings, get_ai_settings


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}


@dataclass
class AdapterStatus:
    """Lightweight health record for a local AI adapter."""

    configured: bool
    available: bool
    detail: str


@dataclass
class CoreMentorRuntime:
    """Local runtime facade used by graph agent nodes."""

    settings: CoreMentorAISettings = field(default_factory=get_ai_settings)
    _llm: Any = None
    _embeddings: Any = None
    _memory: Optional["ChromaMemoryStore"] = None
    _documents: Optional["DoclingDocumentParser"] = None
    _vision: Optional["OllamaVisionDescriber"] = None
    _status: Dict[str, AdapterStatus] = field(default_factory=dict)

    @property
    def llm(self) -> Any:
        if not self.settings.llm_enabled:
            self._status["llm"] = AdapterStatus(False, False, "LLM disabled by env.")
            return None

        if self._llm is not None:
            return self._llm

        try:
            from langchain_ollama import ChatOllama

            self._llm = ChatOllama(
                base_url=self.settings.ollama_base_url,
                model=self.settings.ollama_chat_model,
                temperature=self.settings.ollama_temperature,
                num_ctx=self.settings.ollama_num_ctx,
                keep_alive=self.settings.ollama_keep_alive,
                format="json",
            )
            self._status["llm"] = AdapterStatus(
                True,
                True,
                f"ChatOllama configured for {self.settings.ollama_chat_model}.",
            )
        except Exception as exc:
            self._status["llm"] = AdapterStatus(True, False, str(exc))
            self._llm = None

        return self._llm

    @property
    def embeddings(self) -> Any:
        if not self.settings.chroma_enabled:
            self._status["embeddings"] = AdapterStatus(
                False,
                False,
                "Embeddings disabled with Chroma.",
            )
            return None

        if self._embeddings is not None:
            return self._embeddings

        try:
            from langchain_ollama import OllamaEmbeddings

            self._embeddings = OllamaEmbeddings(
                base_url=self.settings.ollama_base_url,
                model=self.settings.ollama_embedding_model,
            )
            self._status["embeddings"] = AdapterStatus(
                True,
                True,
                f"OllamaEmbeddings configured for {self.settings.ollama_embedding_model}.",
            )
        except Exception as exc:
            self._status["embeddings"] = AdapterStatus(True, False, str(exc))
            self._embeddings = None

        return self._embeddings

    @property
    def memory(self) -> Optional["ChromaMemoryStore"]:
        if not self.settings.chroma_enabled:
            self._status["chroma"] = AdapterStatus(False, False, "Chroma disabled by env.")
            return None

        if self._memory is not None:
            return self._memory

        try:
            self._memory = ChromaMemoryStore(self.settings, self.embeddings)
            self._memory.ensure_collections()
            self._status["chroma"] = AdapterStatus(
                True,
                True,
                f"Persistent ChromaDB at {self.settings.chroma_persist_dir}.",
            )
        except Exception as exc:
            self._status["chroma"] = AdapterStatus(True, False, str(exc))
            self._memory = None

        return self._memory

    @property
    def documents(self) -> Optional["DoclingDocumentParser"]:
        if not self.settings.docling_enabled:
            self._status["docling"] = AdapterStatus(False, False, "Docling disabled by env.")
            return None

        if self._documents is not None:
            return self._documents

        self._documents = DoclingDocumentParser(self.settings)
        self._status["docling"] = AdapterStatus(
            True,
            self._documents.available,
            self._documents.detail,
        )
        return self._documents

    @property
    def vision(self) -> Optional["OllamaVisionDescriber"]:
        if not self.settings.vision_enabled:
            self._status["vision"] = AdapterStatus(False, False, "Vision disabled by env.")
            return None

        if self._vision is not None:
            return self._vision

        self._vision = OllamaVisionDescriber(self.settings)
        self._status["vision"] = AdapterStatus(
            True,
            True,
            f"Ollama vision model configured for {self.settings.ollama_vision_model}.",
        )
        return self._vision

    def describe_submission_images(
        self,
        file_path: Optional[str],
        extra_image_paths: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Describe direct image submissions and image paths found by document parsing."""

        describer = self.vision
        if describer is None:
            return {
                "available": False,
                "descriptions": [],
                "detail": "Vision description is unavailable.",
                "model": self.settings.ollama_vision_model,
            }

        candidates: List[Path] = []
        if file_path:
            resolved = _resolve_upload_path(self.settings, file_path)
            if _is_supported_image(resolved):
                candidates.append(resolved)

        for item in extra_image_paths or []:
            resolved = _resolve_upload_path(self.settings, item)
            if _is_supported_image(resolved):
                candidates.append(resolved)

        unique_candidates = _unique_existing_paths(candidates)[: self.settings.vision_max_images]
        if not unique_candidates:
            return {
                "available": False,
                "descriptions": [],
                "detail": "No supported image candidates were found for vision description.",
                "model": self.settings.ollama_vision_model,
            }

        return describer.describe_images(unique_candidates)

    def invoke_json(
        self,
        messages: List[tuple[str, str]],
        fallback: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Invoke the local LLM and merge valid JSON over deterministic fallback."""

        model = self.llm
        if model is None:
            return fallback

        try:
            response = model.invoke(messages)
            raw = getattr(response, "content", response)
            parsed = _extract_json(str(raw))
            return _deep_merge(fallback, parsed)
        except Exception as exc:
            self._status["llm"] = AdapterStatus(
                True,
                False,
                f"ChatOllama invocation failed: {exc}",
            )
            return fallback

    def status(self) -> Dict[str, Dict[str, Any]]:
        """Return current adapter configuration and lazy health details."""

        _ = self.llm
        _ = self.embeddings
        _ = self.memory
        _ = self.documents
        _ = self.vision

        return {
            "agent_mode": self.settings.agent_mode,
            "ollama": {
                "base_url": self.settings.ollama_base_url,
                "chat_model": self.settings.ollama_chat_model,
                "embedding_model": self.settings.ollama_embedding_model,
                "vision_model": self.settings.ollama_vision_model,
            },
            "vision": {
                "enabled": self.settings.vision_enabled,
                "max_images": self.settings.vision_max_images,
                "max_image_bytes": self.settings.vision_max_image_bytes,
            },
            "chroma": {
                "persist_dir": str(self.settings.chroma_persist_dir),
                "student_patterns_collection": self.settings.chroma_student_collection,
                "career_data_collection": self.settings.chroma_career_collection,
            },
            "adapters": {
                name: {
                    "configured": item.configured,
                    "available": item.available,
                    "detail": item.detail,
                }
                for name, item in self._status.items()
            },
        }


class ChromaMemoryStore:
    """Persistent ChromaDB collections for student and career memory."""

    def __init__(self, settings: CoreMentorAISettings, embeddings: Any):
        if embeddings is None:
            raise RuntimeError("Ollama embeddings are required before Chroma can index text.")

        self.settings = settings
        self.embeddings = embeddings
        self.settings.chroma_persist_dir.mkdir(parents=True, exist_ok=True)

        import chromadb

        try:
            from langchain_chroma import Chroma
        except ImportError:
            try:
                from langchain_community.vectorstores import Chroma
            except ImportError as exc:
                raise RuntimeError(
                    "Install langchain-chroma to enable ChromaDB memory: "
                    "`pip install langchain-chroma`."
                ) from exc

        self._client = chromadb.PersistentClient(path=str(self.settings.chroma_persist_dir))
        self._chroma_cls = Chroma
        self.student_patterns = self._collection(self.settings.chroma_student_collection)
        self.career_data = self._collection(self.settings.chroma_career_collection)

    def ensure_collections(self) -> Dict[str, str]:
        """Create the configured collections if they do not already exist."""

        self._client.get_or_create_collection(self.settings.chroma_student_collection)
        self._client.get_or_create_collection(self.settings.chroma_career_collection)
        return {
            "student_patterns": self.settings.chroma_student_collection,
            "career_data": self.settings.chroma_career_collection,
        }

    def search_student_patterns(self, student_id: str, query: str, k: int = 4) -> List[str]:
        return self._search(
            store=self.student_patterns,
            query=query,
            k=k,
            filter_metadata={"student_id": student_id},
            allow_unfiltered_fallback=False,
        )

    def add_student_pattern(
        self,
        student_id: str,
        texts: Iterable[str],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        payload = [text for text in texts if text]
        if not payload:
            return

        base_metadata = _clean_metadata({"student_id": student_id, **(metadata or {})})
        self.student_patterns.add_texts(
            texts=payload,
            metadatas=[base_metadata for _ in payload],
        )

    def search_career_data(self, career_goal: str, query: str, k: int = 4) -> List[str]:
        return self._search(
            store=self.career_data,
            query=f"{career_goal}: {query}",
            k=k,
            filter_metadata={"career_goal": career_goal},
            allow_unfiltered_fallback=True,
        )

    def add_career_data(
        self,
        career_goal: str,
        texts: Iterable[str],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        payload = [text for text in texts if text]
        if not payload:
            return

        base_metadata = _clean_metadata({"career_goal": career_goal, **(metadata or {})})
        self.career_data.add_texts(
            texts=payload,
            metadatas=[base_metadata for _ in payload],
        )

    def _collection(self, name: str) -> Any:
        return self._chroma_cls(
            client=self._client,
            collection_name=name,
            embedding_function=self.embeddings,
        )

    @staticmethod
    def _search(
        store: Any,
        query: str,
        k: int,
        filter_metadata: Dict[str, Any],
        allow_unfiltered_fallback: bool,
    ) -> List[str]:
        try:
            docs = store.similarity_search(query=query, k=k, filter=filter_metadata)
        except Exception:
            if not allow_unfiltered_fallback:
                return []
            docs = store.similarity_search(query=query, k=k)
        return [doc.page_content for doc in docs]


class DoclingDocumentParser:
    """Thin adapter around DoclingLoader for uploaded coursework files."""

    def __init__(self, settings: CoreMentorAISettings):
        self.settings = settings
        try:
            from langchain_docling import DoclingLoader
        except ImportError:
            try:
                from langchain_docling.loader import DoclingLoader
            except ImportError:
                self._loader_cls = None
                self.available = False
                self.detail = "Install langchain-docling to enable DoclingLoader."
                return

        self._loader_cls = DoclingLoader
        self.available = True
        self.detail = "DoclingLoader is importable."

    def load_text(self, file_path: str) -> Dict[str, Any]:
        resolved = _resolve_upload_path(self.settings, file_path)
        if not self.available or self._loader_cls is None:
            return {"available": False, "text": "", "detail": self.detail, "image_paths": []}
        if not resolved.exists():
            return {
                "available": False,
                "text": "",
                "detail": f"File not found: {resolved}",
                "image_paths": [],
            }

        try:
            loader = self._loader_cls(file_path=str(resolved))
            docs = loader.load()
            text = "\n\n".join(doc.page_content for doc in docs if doc.page_content)
            image_paths = _extract_image_paths_from_docling_docs(docs, base_dir=resolved.parent)
            return {
                "available": True,
                "text": text[:12000],
                "detail": f"Loaded {len(docs)} document chunks from {resolved.name}.",
                "image_paths": image_paths,
            }
        except Exception as exc:
            return {
                "available": False,
                "text": "",
                "detail": f"Docling failed for {resolved}: {exc}",
                "image_paths": [],
            }


class OllamaVisionDescriber:
    """Lightweight image-description adapter for local Ollama vision models."""

    def __init__(self, settings: CoreMentorAISettings):
        self.settings = settings
        self.endpoint = settings.ollama_base_url.rstrip("/") + "/api/generate"

    def describe_images(self, image_paths: List[Path]) -> Dict[str, Any]:
        descriptions: List[Dict[str, Any]] = []
        errors: List[str] = []

        for image_path in image_paths:
            if image_path.stat().st_size > self.settings.vision_max_image_bytes:
                errors.append(f"{image_path.name} exceeds vision byte limit.")
                continue

            try:
                descriptions.append(self._describe_one(image_path))
            except Exception as exc:
                errors.append(f"{image_path.name}: {exc}")

        return {
            "available": bool(descriptions),
            "descriptions": descriptions,
            "detail": (
                f"Described {len(descriptions)} image(s) with {self.settings.ollama_vision_model}."
                if descriptions
                else "No image descriptions were produced."
            ),
            "model": self.settings.ollama_vision_model,
            "errors": errors,
        }

    def _describe_one(self, image_path: Path) -> Dict[str, Any]:
        encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
        prompt = (
            "Describe this student submission image for a teacher who is grading homework. "
            "Focus on visible written work, diagrams, equations, labels, answer structure, "
            "and anything that may affect grading. Be concise and factual."
        )
        payload = {
            "model": self.settings.ollama_vision_model,
            "prompt": prompt,
            "images": [encoded],
            "stream": False,
            "options": {
                "temperature": 0,
                "num_ctx": min(self.settings.ollama_num_ctx, 2048),
            },
        }
        data = json.dumps(payload).encode("utf-8")
        req = urlrequest.Request(
            self.endpoint,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urlrequest.urlopen(req, timeout=90) as response:
                body = json.loads(response.read().decode("utf-8"))
        except URLError as exc:
            raise RuntimeError(f"Ollama vision request failed: {exc}") from exc

        return {
            "file_name": image_path.name,
            "path": str(image_path),
            "mime_type": mimetypes.guess_type(str(image_path))[0] or "image/*",
            "model": self.settings.ollama_vision_model,
            "description": str(body.get("response", "")).strip(),
        }


def _extract_json(text: str) -> Dict[str, Any]:
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return {}

    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        elif value not in (None, "", []):
            merged[key] = value
    return merged


def _clean_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: value
        for key, value in metadata.items()
        if isinstance(value, (str, int, float, bool))
    }


def _resolve_upload_path(settings: CoreMentorAISettings, file_path: str) -> Path:
    path = Path(file_path)
    if path.is_absolute():
        return path

    project_path = settings.uploads_dir.parent / path
    if project_path.exists():
        return project_path

    return settings.uploads_dir / path.name


def _is_supported_image(path: Path) -> bool:
    return path.exists() and path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS


def _unique_existing_paths(paths: Iterable[Path]) -> List[Path]:
    seen: set[str] = set()
    unique: List[Path] = []
    for path in paths:
        try:
            resolved = path.resolve()
        except OSError:
            continue
        key = str(resolved)
        if key in seen or not resolved.exists():
            continue
        seen.add(key)
        unique.append(resolved)
    return unique


def _extract_image_paths_from_docling_docs(docs: Iterable[Any], base_dir: Path) -> List[str]:
    candidates: List[str] = []
    for doc in docs:
        metadata = getattr(doc, "metadata", {}) or {}
        candidates.extend(_walk_for_image_paths(metadata, base_dir=base_dir))
    return [str(path) for path in _unique_existing_paths(Path(item) for item in candidates)]


def _walk_for_image_paths(value: Any, base_dir: Path) -> List[str]:
    paths: List[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            key_lower = str(key).lower()
            if isinstance(item, str) and "image" in key_lower:
                candidate = Path(item)
                if not candidate.is_absolute():
                    candidate = base_dir / candidate
                if candidate.suffix.lower() in IMAGE_EXTENSIONS:
                    paths.append(str(candidate))
            else:
                paths.extend(_walk_for_image_paths(item, base_dir))
    elif isinstance(value, list):
        for item in value:
            paths.extend(_walk_for_image_paths(item, base_dir))
    return paths
