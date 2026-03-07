from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


class PromptCatalog:
    """
    Catálogo de prompts em disco.

    Formato suportado: arquivos `.md` com frontmatter simples seguido de
    seções `## system_prompt` e `## user_prompt_template`.

    Estrutura esperada do arquivo .md:
    ```
    ---
    name: meu_prompt
    mode: text          # "text" ou "decision"
    description: Descrição curta do prompt.
    ---

    ## system_prompt

    Texto do system prompt aqui.

    ## user_prompt_template

    Template com {variáveis} aqui.
    ```

    Suporte legado a `.json` é mantido como fallback.
    """

    def __init__(self, prompts_dir: Path) -> None:
        self.prompts_dir = prompts_dir

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_prompts(self) -> list[dict[str, str]]:
        seen: set[str] = set()
        prompts: list[dict[str, str]] = []
        # .md takes priority; then .json fallback
        for path in sorted(self.prompts_dir.glob("*.md")) + sorted(self.prompts_dir.glob("*.json")):
            if path.stem in seen:
                continue
            seen.add(path.stem)
            payload = self._parse_file(path)
            prompts.append(
                {
                    "name": str(payload.get("name", path.stem)),
                    "mode": str(payload.get("mode", "text")),
                    "description": str(payload.get("description", "")),
                }
            )
        return prompts

    def render(self, prompt_name: str, variables: dict[str, Any]) -> dict[str, str]:
        payload = self._load(prompt_name)
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

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load(self, prompt_name: str) -> dict[str, Any]:
        for ext in (".md", ".json"):
            path = self.prompts_dir / f"{prompt_name}{ext}"
            if path.exists():
                return self._parse_file(path)
        raise FileNotFoundError(f"Prompt '{prompt_name}' not found in {self.prompts_dir}")

    def _parse_file(self, path: Path) -> dict[str, Any]:
        if path.suffix == ".md":
            return self._parse_md(path.read_text(encoding="utf-8"))
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _parse_md(text: str) -> dict[str, Any]:
        """
        Parse a markdown prompt file.

        Extracts:
        - frontmatter between `---` delimiters (key: value pairs)
        - `## system_prompt` section
        - `## user_prompt_template` section
        """
        result: dict[str, Any] = {}

        # --- frontmatter ---
        fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
        if fm_match:
            for line in fm_match.group(1).splitlines():
                if ":" in line:
                    key, _, value = line.partition(":")
                    result[key.strip()] = value.strip()
            text = text[fm_match.end():]

        # --- named sections (## section_name) ---
        sections = re.split(r"^##\s+(\S+)\s*$", text.strip(), flags=re.MULTILINE)
        # sections = [preamble, name1, content1, name2, content2, ...]
        it = iter(sections[1:])  # skip preamble
        for section_name, section_body in zip(it, it):
            result[section_name.strip()] = section_body.strip()

        return result


class _SafePromptVariables(dict):
    def __missing__(self, key: str) -> str:
        return ""