from __future__ import annotations

import argparse
import sys
from pathlib import Path

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the FastAPI app from the current repo checkout.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    src_path = project_root / "src"
    sys.path.insert(0, str(src_path))

    from jira_issue_rag.main import app

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
