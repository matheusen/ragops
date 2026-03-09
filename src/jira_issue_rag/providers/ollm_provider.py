from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from jira_issue_rag.providers.base import LLMProvider
from jira_issue_rag.providers.decision_contract import normalize_decision_data
from jira_issue_rag.shared.models import DecisionResult, JudgeInput

_RUNTIME_CACHE: dict[tuple[str, str, str, bool, int, bool], Any] = {}
_RUNTIME_LOCK = threading.Lock()


class OLLMProvider(LLMProvider):
    provider_name = "ollm"

    def __init__(
        self,
        *,
        model_name: str,
        device: str,
        models_dir: Path,
        cache_dir: Path,
        force_download: bool = False,
        offload_layers: int = 0,
        max_new_tokens: int = 1200,
        logging_enabled: bool = False,
    ) -> None:
        self.model_name = model_name
        self.device = device
        self.models_dir = Path(models_dir)
        self.cache_dir = Path(cache_dir)
        self.force_download = force_download
        self.offload_layers = max(0, offload_layers)
        self.max_new_tokens = max(64, max_new_tokens)
        self.logging_enabled = logging_enabled

    def is_available(self) -> bool:
        if not self.model_name.strip():
            return False
        try:
            __import__("ollm")
        except Exception:
            return False
        return True

    def judge_issue(self, judge_input: JudgeInput) -> DecisionResult:
        output_text = self.run_prompt(
            system_prompt=(
                "You are validating whether a Jira issue is a real bug, whether it is complete, "
                "and whether it is ready for development. Return only valid JSON with no markdown fences."
            ),
            user_prompt=judge_input.model_dump_json(indent=2),
            response_format="json",
        )
        decision_data = json.loads(output_text)
        normalized = normalize_decision_data(decision_data, judge_input)
        return DecisionResult.model_validate(
            {**normalized, "provider": self.provider_name, "model": self.model_name}
        )

    def run_prompt(
        self,
        system_prompt: str,
        user_prompt: str,
        response_format: str = "text",
    ) -> str:
        runtime = self._get_runtime()
        tokenizer = runtime.tokenizer
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        input_ids = tokenizer.apply_chat_template(
            messages,
            reasoning_effort="minimal",
            tokenize=True,
            add_generation_prompt=True,
            return_tensors="pt",
        ).to(runtime.device)
        past_key_values = None
        if self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            past_key_values = runtime.DiskCache(cache_dir=str(self.cache_dir))
        outputs = runtime.model.generate(
            input_ids=input_ids,
            past_key_values=past_key_values,
            max_new_tokens=self.max_new_tokens,
            do_sample=False,
        ).cpu()
        answer = tokenizer.decode(
            outputs[0][input_ids.shape[-1]:],
            skip_special_tokens=True,
        ).strip()
        if response_format == "json":
            return _strip_json_fences(answer)
        return answer

    def _get_runtime(self) -> Any:
        key = (
            self.model_name,
            self.device,
            str(self.models_dir),
            self.force_download,
            self.offload_layers,
            self.logging_enabled,
        )
        with _RUNTIME_LOCK:
            cached = _RUNTIME_CACHE.get(key)
            if cached is not None:
                return cached

            from ollm import Inference

            runtime = Inference(
                self.model_name,
                device=self.device,
                logging=self.logging_enabled,
            )
            runtime.ini_model(
                models_dir=str(self.models_dir),
                force_download=self.force_download,
            )
            if self.offload_layers > 0:
                runtime.offload_layers_to_cpu(layers_num=self.offload_layers)
            _RUNTIME_CACHE[key] = runtime
            return runtime


def _strip_json_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    return cleaned
