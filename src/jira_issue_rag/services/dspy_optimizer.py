"""
DSPy optimization lab for the Jira Issue Validation RAG pipeline.

This module is the *optimization side-car* — it runs against a golden dataset,
tunes each module's prompt/program with BootstrapFewShot or MIPROv2, and
exports the best compiled programs back to the prompts/ directory so they can
be loaded by the production PromptCatalog.

Usage (standalone CLI):
    python -m jira_issue_rag.services.dspy_optimizer \
        --golden examples/golden_dataset.json \
        --provider openai \
        --output prompts/ \
        --optimizer bootstrap

Architecture notes from README:
    - runtime = LangGraph + typed services  (production)
    - optimization lab = DSPy + GEPA        (this file)
    - port best prompts back via JSON export
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

try:
    import dspy  # type: ignore[import-untyped]
    _DSPY_AVAILABLE = True
except ImportError:
    _DSPY_AVAILABLE = False


# ──────────────────────────────────────────────────────────────────────────────
# DSPy Signatures
# Each signature corresponds to one module in the modular judge pipeline.
# ──────────────────────────────────────────────────────────────────────────────

def _require_dspy() -> None:
    if not _DSPY_AVAILABLE:
        raise ImportError(
            "dspy-ai is not installed. Install it with: pip install -e '.[optimization]'"
        )


class ExtractIssueFacts(dspy.Signature if _DSPY_AVAILABLE else object):  # type: ignore[misc]
    """Extract structured facts from a Jira issue and its attached evidence."""

    issue_json: str = dspy.InputField(desc="IssueCanonical as JSON") if _DSPY_AVAILABLE else None
    attachment_facts_json: str = dspy.InputField(desc="AttachmentFacts as JSON") if _DSPY_AVAILABLE else None
    rule_evaluation_json: str = dspy.InputField(desc="RuleEvaluation as JSON") if _DSPY_AVAILABLE else None
    extracted_facts: str = dspy.OutputField(
        desc="Structured plain-text list of facts. Each fact on its own line prefixed with '- '. "
             "Preserve exact IDs, error messages, timestamps and monetary values verbatim."
    ) if _DSPY_AVAILABLE else None


class DetectContradictions(dspy.Signature if _DSPY_AVAILABLE else object):  # type: ignore[misc]
    """Identify explicit contradictions between extracted facts and retrieved evidence."""

    extracted_facts: str = dspy.InputField(desc="Structured facts extracted from the issue") if _DSPY_AVAILABLE else None
    retrieved_evidence_json: str = dspy.InputField(desc="Retrieved evidence snippets as JSON") if _DSPY_AVAILABLE else None
    rule_contradictions: str = dspy.InputField(desc="Contradictions already detected by the rules engine") if _DSPY_AVAILABLE else None
    contradictions_text: str = dspy.OutputField(
        desc="List of contradictions, one per line prefixed 'CONTRADICTION: '. "
             "If none, write 'No contradictions detected.'"
    ) if _DSPY_AVAILABLE else None


class CheckCompleteness(dspy.Signature if _DSPY_AVAILABLE else object):  # type: ignore[misc]
    """Assess whether a bug issue has all required fields for readiness."""

    extracted_facts: str = dspy.InputField(desc="Structured facts from the issue") if _DSPY_AVAILABLE else None
    contradictions_text: str = dspy.InputField(desc="Detected contradictions") if _DSPY_AVAILABLE else None
    missing_items: str = dspy.InputField(desc="Fields flagged as missing by the rules engine") if _DSPY_AVAILABLE else None
    completeness_text: str = dspy.OutputField(
        desc="Assessment with 'PRESENT: <field>' or 'MISSING: <field>' per required field, "
             "ending with 'VERDICT: COMPLETE' or 'VERDICT: INCOMPLETE'."
    ) if _DSPY_AVAILABLE else None


class JudgeBug(dspy.Signature if _DSPY_AVAILABLE else object):  # type: ignore[misc]
    """Produce the final structured bug validation decision as JSON."""

    extracted_facts: str = dspy.InputField(desc="Structured facts") if _DSPY_AVAILABLE else None
    contradictions_text: str = dspy.InputField(desc="Detected contradictions") if _DSPY_AVAILABLE else None
    completeness_text: str = dspy.InputField(desc="Completeness assessment") if _DSPY_AVAILABLE else None
    distilled_context_json: str = dspy.InputField(desc="DistilledContext as JSON") if _DSPY_AVAILABLE else None
    rule_evaluation_json: str = dspy.InputField(desc="RuleEvaluation as JSON") if _DSPY_AVAILABLE else None
    decision_json: str = dspy.OutputField(
        desc="Valid JSON with fields: issue_key, classification, is_bug, is_complete, "
             "ready_for_dev, missing_items, evidence_used, contradictions, "
             "financial_impact_detected, confidence, requires_human_review, rationale"
    ) if _DSPY_AVAILABLE else None


# ──────────────────────────────────────────────────────────────────────────────
# DSPy Modules (composable, one per pipeline stage)
# ──────────────────────────────────────────────────────────────────────────────

class FactExtractorModule(dspy.Module if _DSPY_AVAILABLE else object):  # type: ignore[misc]
    def __init__(self) -> None:
        if _DSPY_AVAILABLE:
            super().__init__()
            self.predict = dspy.ChainOfThought(ExtractIssueFacts)

    def forward(self, issue_json: str, attachment_facts_json: str, rule_evaluation_json: str) -> Any:
        _require_dspy()
        return self.predict(
            issue_json=issue_json,
            attachment_facts_json=attachment_facts_json,
            rule_evaluation_json=rule_evaluation_json,
        )


class ContradictionDetectorModule(dspy.Module if _DSPY_AVAILABLE else object):  # type: ignore[misc]
    def __init__(self) -> None:
        if _DSPY_AVAILABLE:
            super().__init__()
            self.predict = dspy.ChainOfThought(DetectContradictions)

    def forward(self, extracted_facts: str, retrieved_evidence_json: str, rule_contradictions: str) -> Any:
        _require_dspy()
        return self.predict(
            extracted_facts=extracted_facts,
            retrieved_evidence_json=retrieved_evidence_json,
            rule_contradictions=rule_contradictions,
        )


class CompletenessCheckerModule(dspy.Module if _DSPY_AVAILABLE else object):  # type: ignore[misc]
    def __init__(self) -> None:
        if _DSPY_AVAILABLE:
            super().__init__()
            self.predict = dspy.ChainOfThought(CheckCompleteness)

    def forward(self, extracted_facts: str, contradictions_text: str, missing_items: str) -> Any:
        _require_dspy()
        return self.predict(
            extracted_facts=extracted_facts,
            contradictions_text=contradictions_text,
            missing_items=missing_items,
        )


class BugJudgeModule(dspy.Module if _DSPY_AVAILABLE else object):  # type: ignore[misc]
    def __init__(self) -> None:
        if _DSPY_AVAILABLE:
            super().__init__()
            self.predict = dspy.ChainOfThought(JudgeBug)

    def forward(
        self,
        extracted_facts: str,
        contradictions_text: str,
        completeness_text: str,
        distilled_context_json: str,
        rule_evaluation_json: str,
    ) -> Any:
        _require_dspy()
        return self.predict(
            extracted_facts=extracted_facts,
            contradictions_text=contradictions_text,
            completeness_text=completeness_text,
            distilled_context_json=distilled_context_json,
            rule_evaluation_json=rule_evaluation_json,
        )


class FullValidationPipeline(dspy.Module if _DSPY_AVAILABLE else object):  # type: ignore[misc]
    """End-to-end DSPy pipeline: facts → contradictions → completeness → judge."""

    def __init__(self) -> None:
        if _DSPY_AVAILABLE:
            super().__init__()
        self.extractor = FactExtractorModule()
        self.contradiction_detector = ContradictionDetectorModule()
        self.completeness_checker = CompletenessCheckerModule()
        self.judge = BugJudgeModule()

    def forward(
        self,
        issue_json: str,
        attachment_facts_json: str,
        rule_evaluation_json: str,
        retrieved_evidence_json: str,
        distilled_context_json: str,
    ) -> Any:
        _require_dspy()
        facts_pred = self.extractor(
            issue_json=issue_json,
            attachment_facts_json=attachment_facts_json,
            rule_evaluation_json=rule_evaluation_json,
        )
        contradictions_pred = self.contradiction_detector(
            extracted_facts=facts_pred.extracted_facts,
            retrieved_evidence_json=retrieved_evidence_json,
            rule_contradictions="",
        )
        completeness_pred = self.completeness_checker(
            extracted_facts=facts_pred.extracted_facts,
            contradictions_text=contradictions_pred.contradictions_text,
            missing_items="",
        )
        judge_pred = self.judge(
            extracted_facts=facts_pred.extracted_facts,
            contradictions_text=contradictions_pred.contradictions_text,
            completeness_text=completeness_pred.completeness_text,
            distilled_context_json=distilled_context_json,
            rule_evaluation_json=rule_evaluation_json,
        )
        return judge_pred


# ──────────────────────────────────────────────────────────────────────────────
# Metric functions
# ──────────────────────────────────────────────────────────────────────────────

def classification_accuracy_metric(example: Any, prediction: Any, trace: Any = None) -> float:
    """Score 1.0 if classification + ready_for_dev + is_complete all match."""
    try:
        decision = json.loads(prediction.decision_json)
    except Exception:
        return 0.0
    score = 0.0
    if decision.get("classification") == example.expected_classification:
        score += 0.5
    if bool(decision.get("ready_for_dev")) == example.expected_ready_for_dev:
        score += 0.25
    if bool(decision.get("is_complete")) == example.expected_is_complete:
        score += 0.25
    return score


def confidence_penalized_metric(example: Any, prediction: Any, trace: Any = None) -> float:
    """Binary accuracy penalized by low confidence — rewards both correctness and calibration."""
    base = classification_accuracy_metric(example, prediction, trace)
    try:
        decision = json.loads(prediction.decision_json)
        confidence = float(decision.get("confidence", 0.5))
    except Exception:
        confidence = 0.5
    return base * confidence


# ──────────────────────────────────────────────────────────────────────────────
# DSPyOptimizationLab
# ──────────────────────────────────────────────────────────────────────────────

class DSPyOptimizationLab:
    """
    Runs DSPy optimizers against the golden dataset and exports
    the best programs as JSON prompt files.

    Recommended workflow:
        lab = DSPyOptimizationLab(settings)
        lab.configure_lm(provider="openai")
        result = lab.optimize(
            golden_path="examples/golden_dataset.json",
            optimizer="bootstrap",     # or "mipro"
            metric="classification",   # or "confidence_penalized"
        )
        lab.export_to_prompts(result["program"], output_dir=Path("prompts"))
    """

    def __init__(self, settings: Any | None = None) -> None:
        _require_dspy()
        self.settings = settings

    def configure_lm(self, provider: str = "openai", model: str | None = None) -> None:
        """Configure the DSPy language model backend."""
        _require_dspy()
        if provider == "openai":
            m = model or (self.settings.openai_model if self.settings else "gpt-5-mini")
            api_key = self.settings.openai_api_key if self.settings else None
            lm = dspy.LM(f"openai/{m}", api_key=api_key)
        elif provider == "gemini":
            m = model or (self.settings.gemini_model if self.settings else "gemini-2.5-flash")
            lm = dspy.LM(f"google/{m}")
        elif provider == "ollama":
            # Local Ollama — article: DSPy 3 + GEPA; use keep_alive model via OpenAI-compat API
            m = model or (self.settings.ollama_model if self.settings else "llama3.1:8b")
            base = (self.settings.ollama_base_url if self.settings else "http://localhost:11434").rstrip("/")
            lm = dspy.LM(f"ollama/{m}", api_base=f"{base}/v1", api_key="ollama")
        else:
            raise ValueError(f"Unsupported provider for DSPy lab: {provider}")
        dspy.configure(lm=lm)

    def load_trainset(self, golden_path: str | Path) -> list[Any]:
        """Load golden dataset examples as DSPy Example objects."""
        _require_dspy()
        raw = json.loads(Path(golden_path).read_text(encoding="utf-8"))
        examples = []
        for item in raw:
            issue = item.get("issue", {})
            attachment_facts = {"issue_key": issue.get("issue_key", ""), "artifacts": []}
            rule_evaluation = {"missing_items": item.get("expected_missing_items", []), "contradictions": [], "financial_impact_detected": False, "requires_human_review": False, "results": []}
            examples.append(
                dspy.Example(
                    issue_json=json.dumps(issue, ensure_ascii=False),
                    attachment_facts_json=json.dumps(attachment_facts, ensure_ascii=False),
                    rule_evaluation_json=json.dumps(rule_evaluation, ensure_ascii=False),
                    retrieved_evidence_json="[]",
                    distilled_context_json=json.dumps({"key_facts": [], "preserved_quotes": [], "evidence": []}, ensure_ascii=False),
                    # labels
                    expected_classification=item.get("expected_classification", "needs_review"),
                    expected_ready_for_dev=bool(item.get("expected_ready_for_dev", False)),
                    expected_is_complete=bool(item.get("expected_is_complete", False)),
                ).with_inputs(
                    "issue_json",
                    "attachment_facts_json",
                    "rule_evaluation_json",
                    "retrieved_evidence_json",
                    "distilled_context_json",
                )
            )
        return examples

    def optimize(
        self,
        golden_path: str | Path,
        optimizer: str = "bootstrap",
        metric: str = "classification",
        max_bootstrapped_demos: int = 3,
        num_candidates: int = 10,
        train_split: float = 0.8,
    ) -> dict[str, Any]:
        """
        Run an optimizer over the golden dataset.

        Args:
            optimizer: "bootstrap" (BootstrapFewShot) or "mipro" (MIPROv2)
            metric: "classification" or "confidence_penalized"
            max_bootstrapped_demos: demos per module for BootstrapFewShot
            num_candidates: MIPROv2 candidate programs to try
            train_split: fraction of examples to use for training

        Returns:
            dict with "program" (compiled module) and "scores" (train/dev metrics)
        """
        _require_dspy()
        examples = self.load_trainset(golden_path)
        split = max(1, int(len(examples) * train_split))
        trainset, devset = examples[:split], examples[split:]

        metric_fn = (
            confidence_penalized_metric
            if metric == "confidence_penalized"
            else classification_accuracy_metric
        )

        pipeline = FullValidationPipeline()

        if optimizer == "mipro":
            compiled = self._run_mipro(pipeline, trainset, devset, metric_fn, num_candidates)
        elif optimizer == "gepa":
            # GEPA = COPRO — generates instruction candidates via an instruction-proposer LLM
            # article: "DSPy 3 + GEPA" — breadth candidates, depth refinement steps
            compiled = self._run_gepa(pipeline, trainset, devset, metric_fn, num_candidates)
        else:
            compiled = self._run_bootstrap(pipeline, trainset, metric_fn, max_bootstrapped_demos)

        dev_score = self._evaluate(compiled, devset, metric_fn) if devset else None
        return {"program": compiled, "dev_score": dev_score, "optimizer": optimizer}

    @staticmethod
    def _run_gepa(program: Any, trainset: list, devset: list, metric_fn: Any, num_candidates: int) -> Any:
        """GEPA optimizer via dspy.COPRO — instruction generation + selection."""
        teleprompter = dspy.COPRO(
            metric=metric_fn,
            verbose=False,
            breadth=num_candidates,
            depth=3,
        )
        eval_kwargs = {"num_threads": 1, "display_progress": False, "display_table": False}
        return teleprompter.compile(
            program,
            trainset=trainset,
            eval_kwargs=eval_kwargs,
        )

    @staticmethod
    def _run_bootstrap(program: Any, trainset: list, metric_fn: Any, max_bootstrapped_demos: int) -> Any:
        teleprompter = dspy.BootstrapFewShot(
            metric=metric_fn,
            max_bootstrapped_demos=max_bootstrapped_demos,
        )
        return teleprompter.compile(program, trainset=trainset)

    @staticmethod
    def _run_mipro(program: Any, trainset: list, devset: list, metric_fn: Any, num_candidates: int) -> Any:
        teleprompter = dspy.MIPROv2(
            metric=metric_fn,
            num_candidates=num_candidates,
            auto="light",
        )
        return teleprompter.compile(
            program,
            trainset=trainset,
            valset=devset or trainset[:max(1, len(trainset) // 5)],
        )

    @staticmethod
    def _evaluate(program: Any, devset: list, metric_fn: Any) -> float:
        evaluator = dspy.Evaluate(devset=devset, metric=metric_fn, display_progress=False)
        return float(evaluator(program))

    def export_to_prompts(self, program: Any, output_dir: Path) -> list[str]:
        """
        Export the compiled DSPy program's best instructions back to the
        prompts/ directory as JSON files, compatible with PromptCatalog.

        Returns the list of written file paths.
        """
        _require_dspy()
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        written: list[str] = []

        module_map = {
            "extractor": ("extract_issue_facts", "text"),
            "contradiction_detector": ("detect_contradictions", "text"),
            "completeness_checker": ("check_completeness", "text"),
            "judge": ("judge_bug", "decision"),
        }

        for attr_name, (prompt_name, mode) in module_map.items():
            module = getattr(program, attr_name, None)
            if module is None:
                continue
            predictor = getattr(module, "predict", None)
            if predictor is None:
                continue
            # Extract the optimized instruction from the compiled predictor
            instruction: str = ""
            extended: list[dict] = []
            try:
                # dspy stores instructions inside the signature
                instruction = predictor.signature.instructions or ""
                # Demos (few-shot examples) bootstrapped by the optimizer
                for demo in getattr(predictor, "demos", [])[:3]:
                    extended.append({k: str(v) for k, v in demo.items()})
            except Exception:
                pass

            path = output_dir / f"{prompt_name}.json"
            existing: dict = {}
            if path.exists():
                try:
                    existing = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    pass

            payload = {
                **existing,
                "name": prompt_name,
                "mode": mode,
                "dspy_optimized": True,
                "system_prompt": instruction or existing.get("system_prompt", ""),
                "user_prompt_template": existing.get("user_prompt_template", ""),
            }
            if extended:
                payload["few_shot_demos"] = extended

            path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
            written.append(str(path))

        return written


# ──────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    _require_dspy()

    parser = argparse.ArgumentParser(description="DSPy optimization lab for Jira Issue RAG")
    parser.add_argument("--golden", default="examples/golden_dataset.json")
    parser.add_argument("--provider", default="openai", choices=["openai", "gemini"])
    parser.add_argument("--model", default=None)
    parser.add_argument("--output", default="prompts")
    parser.add_argument("--optimizer", default="bootstrap", choices=["bootstrap", "mipro"])
    parser.add_argument("--metric", default="classification", choices=["classification", "confidence_penalized"])
    args = parser.parse_args()

    lab = DSPyOptimizationLab()
    lab.configure_lm(provider=args.provider, model=args.model)
    result = lab.optimize(
        golden_path=args.golden,
        optimizer=args.optimizer,
        metric=args.metric,
    )
    paths = lab.export_to_prompts(result["program"], output_dir=Path(args.output))
    print(f"Optimizer: {result['optimizer']}")
    if result["dev_score"] is not None:
        print(f"Dev score: {result['dev_score']:.3f}")
    print("Exported prompts:")
    for p in paths:
        print(f"  {p}")
