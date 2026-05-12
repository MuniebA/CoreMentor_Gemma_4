"""Create CoreMentor ChromaDB collections and seed starter career examples.

Run from the repository root:

    python backend/scripts/init_chroma.py
"""

from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from agents.runtime import CoreMentorRuntime


CAREER_SEEDS = {
    "Aviation": [
        "Pilots and aerospace engineers use motion equations to estimate climb, "
        "descent, speed, acceleration, and safe stopping distances.",
        "Aviation maintenance teams use unit conversion when checking pressure, "
        "fuel, mass, distance, and temperature values across manuals.",
    ],
    "Doctor": [
        "Doctors compare percentage change in patient readings, dosage, recovery "
        "rates, and lab measurements before making clinical decisions.",
        "Medical teams use careful evidence-based writing when documenting symptoms, "
        "test results, diagnosis, and treatment plans.",
    ],
    "Software Engineer": [
        "Software engineers use algebraic thinking to reason about performance, "
        "data structures, resource limits, and edge cases.",
        "AI engineers explain model decisions with evidence, metrics, and clear "
        "failure analysis before deploying systems.",
    ],
}


def main() -> None:
    runtime = CoreMentorRuntime()
    memory = runtime.memory
    if memory is None:
        print("ChromaDB is not ready.")
        print(runtime.status())
        print()
        print("Install or refresh the vector-memory dependencies:")
        print("  pip install -r requirements.txt")
        print("or from the repository root:")
        print("  pip install -r backend/requirements.txt")
        raise SystemExit(1)

    collections = memory.ensure_collections()
    for career_goal, examples in CAREER_SEEDS.items():
        try:
            memory.add_career_data(
                career_goal=career_goal,
                texts=examples,
                metadata={"source": "corementor_seed"},
            )
        except Exception as exc:
            print(f"Could not seed {career_goal} examples: {exc}")

    print("ChromaDB collections are ready.")
    print(collections)
    print(runtime.status())


if __name__ == "__main__":
    main()
