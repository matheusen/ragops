"""
Ollama local LLM provider — fully private, zero API cost.

Ollama exposes an OpenAI-compatible Chat Completions endpoint at:
    http://localhost:11434/v1/chat/completions

Why this matters for this application:
  - When CONFIDENTIALITY_MODE=true and ALLOW_THIRD_PARTY_LLM=false,
    the only option before this was MockProvider.
  - OllamaProvider makes the full pipeline work completely offline,
    with no data leaving the machine — satisfying strict confidentiality
    requirements without degrading to mock output.

Key Ollama optimizations applied:
  - keep_alive=5m: model stays loaded in VRAM between sequential calls,
    critical for the modular judge pipeline (4 consecutive prompts).
    Eliminates model load time on steps 2-4.
    Source: oLLM / Programação Agentic totalmente local articles.
  - format="json": forces JSON output mode, avoiding wrap/parse issues.

Install:
    curl -fsSL https://ollama.com/install.sh | sh   # Linux/macOS
    # or download from https://ollama.com on Windows

Pull a model:
    ollama pull llama3.1:8b       # fast, good quality
    ollama pull qwen2.5:7b        # strong multilingual
    ollama pull mistral:7b        # good for structured output
    ollama pull phi4:14b          # best quality / GPU permitting

Run:
    ollama serve                  # starts API at localhost:11434
"""
from __future__ import annotations

import json

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_fixed

from jira_issue_rag.providers.base import LLMProvider
from jira_issue_rag.providers.decision_contract import decision_output_contract_text, normalize_decision_data
from jira_issue_rag.shared.models import DecisionResult, JudgeInput

_DEFAULT_BASE_URL = "http://localhost:11434"
_DEFAULT_MODEL = "llama3.1:8b"
_DEFAULT_TIMEOUT_SECONDS = 600

# How long to keep the model loaded between calls.
# 5 minutes covers multi-step modular judge + second opinion in one session.
_KEEP_ALIVE = "5m"


class OllamaProvider(LLMProvider):
    """
    Runs any Ollama-served model via the OpenAI-compatible REST API.

    Works in CONFIDENTIALITY_MODE — all inference is local and private.
    """

    provider_name = "ollama"

    def __init__(
        self,
        base_url: str = _DEFAULT_BASE_URL,
        model_name: str = _DEFAULT_MODEL,
        timeout_seconds: int = _DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.timeout_seconds = max(int(timeout_seconds), 30)

    def is_available(self) -> bool:
        """
        True when a base_url is configured.
        The caller is responsible for ensuring Ollama is running.
        We skip a live-check here to avoid blocking startup if Ollama is not yet ready.
        """
        return bool(self.base_url)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_fixed(2),
        retry=retry_if_exception_type(httpx.HTTPError),
        reraise=True,
    )
    def judge_issue(self, judge_input: JudgeInput) -> DecisionResult:
        output_text = self.run_prompt(
            system_prompt=(
                "You are validating whether a Jira issue is a real bug, "
                "whether it is complete, and whether it is ready for development. "
                "Build an explicit readiness checklist, list blockers, and give a short next action. "
                + decision_output_contract_text()
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
        resolved_model = self._resolve_model_name()
        if resolved_model != self.model_name:
            self.model_name = resolved_model

        payload: dict = {
            "model": resolved_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            # Keeps the model hot in VRAM between sequential modular judge calls.
            # Eliminates model-load overhead on steps 2-4 (~2-10s per step on typical hardware).
            "keep_alive": _KEEP_ALIVE,
            "stream": False,
        }
        if response_format == "json":
            # Ollama's native JSON mode — forces well-formed output, avoids markdown fences.
            payload["format"] = "json"

        timeout = httpx.Timeout(connect=10.0, read=float(self.timeout_seconds), write=60.0, pool=10.0)
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(
                    f"{self.base_url}/v1/chat/completions",
                    headers={"Content-Type": "application/json"},
                    json=payload,
                )
                if response.status_code >= 400:
                    self._raise_for_status(response, requested_model=resolved_model)
                data = response.json()
        except httpx.ReadTimeout as exc:
            raise RuntimeError(
                f"Ollama timed out after {self.timeout_seconds}s while running model '{resolved_model}'. "
                "Local models can take longer on first load or with long article prompts. "
                "Increase OLLAMA_TIMEOUT_SECONDS or try a smaller model."
            ) from exc

        return self._extract_content(data)

    def _resolve_model_name(self) -> str:
        available = self.list_local_models()
        if not available:
            return self.model_name

        requested = self.model_name.strip()
        lowered = requested.lower()
        exact = next((model for model in available if model.lower() == lowered), None)
        if exact:
            return exact

        family = requested.split(":", 1)[0].strip().lower()
        family_matches = [model for model in available if model.lower().startswith(f"{family}:")]
        if not family_matches:
            return requested

        latest = next((model for model in family_matches if model.lower() == f"{family}:latest"), None)
        return latest or family_matches[0]

    def _raise_for_status(self, response: httpx.Response, *, requested_model: str) -> None:
        try:
            data = response.json()
        except Exception:
            response.raise_for_status()
            return

        message = ""
        if isinstance(data, dict):
            if isinstance(data.get("error"), dict):
                message = str(data["error"].get("message", ""))
            elif data.get("error"):
                message = str(data.get("error", ""))

        if response.status_code == 404 and "not found" in message.lower() and "model" in message.lower():
            available = self.list_local_models()
            available_label = ", ".join(available) if available else "nenhum modelo local encontrado"
            raise RuntimeError(
                f"Ollama model '{requested_model}' nao esta disponivel em {self.base_url}. "
                f"Modelos locais: {available_label}."
            )

        lowered = message.lower()
        if "cudamalloc failed" in lowered or "out of memory" in lowered:
            raise RuntimeError(
                f"Ollama falhou ao executar '{requested_model}' por falta de VRAM: {message}. "
                "Feche processos que estejam usando a GPU, tente um modelo menor ou rode o Ollama em CPU."
            )

        if message:
            raise RuntimeError(
                f"Ollama retornou erro {response.status_code} para o modelo '{requested_model}': {message}"
            )

        response.raise_for_status()

    @staticmethod
    def _extract_content(data: dict) -> str:
        choices = data.get("choices") or []
        if choices:
            content = choices[0].get("message", {}).get("content", "")
            return str(content)
        raise ValueError(
            f"Ollama response had no choices. Keys: {list(data.keys())}"
        )

    def list_local_models(self) -> list[str]:
        """Return model tags currently available in the local Ollama registry."""
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                return [m.get("name", "") for m in response.json().get("models", [])]
        except Exception:
            return []
