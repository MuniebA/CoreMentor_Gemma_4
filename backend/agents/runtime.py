"""Runtime adapters for Ollama, ChromaDB, and Docling."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from agents.config import CoreMentorAISettings, get_ai_settings


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

        return {
            "agent_mode": self.settings.agent_mode,
            "ollama": {
                "base_url": self.settings.ollama_base_url,
                "chat_model": self.settings.ollama_chat_model,
                "embedding_model": self.settings.ollama_embedding_model,
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
        from langchain_chroma import Chroma

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

        base_metadata = {"student_id": student_id, **(metadata or {})}
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

        base_metadata = {"career_goal": career_goal, **(metadata or {})}
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
    ) -> List[str]:
        try:
            docs = store.similarity_search(query=query, k=k, filter=filter_metadata)
        except Exception:
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
        resolved = self._resolve_upload_path(file_path)
        if not self.available or self._loader_cls is None:
            return {"available": False, "text": "", "detail": self.detail}
        if not resolved.exists():
            return {
                "available": False,
                "text": "",
                "detail": f"File not found: {resolved}",
            }

        try:
            loader = self._loader_cls(file_path=str(resolved))
            docs = loader.load()
            text = "\n\n".join(doc.page_content for doc in docs if doc.page_content)
            return {
                "available": True,
                "text": text[:12000],
                "detail": f"Loaded {len(docs)} document chunks from {resolved.name}.",
            }
        except Exception as exc:
            return {
                "available": False,
                "text": "",
                "detail": f"Docling failed for {resolved}: {exc}",
            }

    def _resolve_upload_path(self, file_path: str) -> Path:
        path = Path(file_path)
        if path.is_absolute():
            return path

        project_path = self.settings.uploads_dir.parent / path
        if project_path.exists():
            return project_path

        return self.settings.uploads_dir / path.name


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

