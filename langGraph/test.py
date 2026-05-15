"""Smoke helper for the CoreMentor LangGraph orchestration schema.

Run from the repository root with:

    python langGraph/test.py
"""

from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

try:
    from agents.schemas import OrchestrationRequest
except ModuleNotFoundError as exc:
    missing = exc.name or "a backend dependency"
    raise SystemExit(
        f"Missing {missing}. Install backend dependencies with "
        "`pip install -r backend/requirements.txt`."
    ) from exc


def main() -> None:
    request = OrchestrationRequest(workflow="daily_plan", persist=False)
    print(request.model_dump())


if __name__ == "__main__":
    main()
