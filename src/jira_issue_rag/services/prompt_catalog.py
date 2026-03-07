from __future__ import annotations

import json
from pathlib import Path
from string import Formatter
from typing import Any


class PromptCatalog:
    def __init__(self, prompts_dir: Path) -> None:
        self.prompts_dir = prompts_dir

    def list_prompts(self) -> list[dict[str, str]]:
        prompts: list[dict[str, str]] = []
        for path in sorted(self.prompts_dir.glob("*.json")):
            payload = json.loads(path.read_text(encoding="utf-8"))
            prompts.append(
                {
                    "name": str(payload.get("name", path.stem)),
                    "mode": str(payload.get("mode", "text")),
                    "description": str(payload.get("description", "")),
                }
            )
        return prompts

    def render(self, prompt_name: str, variables: dict[str, Any]) -> dict[str, str]:
        path = self.prompts_dir / f"{prompt_name}.json"
        if not path.exists():
            raise FileNotFoundError(f"Prompt '{prompt_name}' not found in {self.prompts_dir}")
        payload = json.loads(path.read_text(encoding="utf-8"))
        system_prompt = str(payload.get("system_prompt", ""))
        user_prompt_template = str(payload.get("user_prompt_template", ""))
        rendered_user_prompt = user_prompt_template.format_map(_SafePromptVariables(variables))
        return {
            "name": str(payload.get("name", prompt_name)),
            "mode": str(payload.get("mode", "text")),
            "description": str(payload.get("description", "")),
            "system_prompt": system_prompt,
            "user_prompt": rendered_user_prompt,
        }


class _SafePromptVariables(dict):
    def __missing__(self, key: str) -> str:
        return ""