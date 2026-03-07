from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import orjson


class AuditStore:
    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def write(self, issue_key: str, payload: dict[str, Any]) -> str:
        issue_dir = self.base_dir / issue_key
        issue_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = issue_dir / f"{timestamp}.json"
        path.write_bytes(orjson.dumps(payload, option=orjson.OPT_INDENT_2 | orjson.OPT_SERIALIZE_NUMPY))
        return str(path)
