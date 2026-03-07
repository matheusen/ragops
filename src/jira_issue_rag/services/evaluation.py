from __future__ import annotations

import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import orjson

from jira_issue_rag.core.config import Settings
from jira_issue_rag.shared.models import (
    ComparisonResponse,
    DecisionResult,
    EvaluationExample,
    EvaluationExampleResult,
    EvaluationMetric,
    EvaluationResponse,
    EvaluationScenario,
    IssueCanonical,
    ReplayExampleResult,
    ReplayResponse,
    ScenarioEvaluationResult,
    ValidationRequest,
)


class GoldenDatasetEvaluator:
    def __init__(self, workflow) -> None:
        self.workflow = workflow

    def evaluate(
        self,
        dataset_path: str | Path,
        provider: str | None = None,
        use_ragas_style_metrics: bool = True,
        use_ragas_runtime: bool = False,
    ) -> EvaluationResponse:
        path = Path(dataset_path)
        examples = [EvaluationExample.model_validate(item) for item in json.loads(path.read_text(encoding="utf-8"))]
        results: list[EvaluationExampleResult] = []
        classification_hits = 0
        complete_hits = 0
        ready_hits = 0
        false_positive_bug = 0
        false_ready_for_dev = 0
        evidence_coverage = 0.0
        annotated_evidence_examples = 0
        annotated_contradiction_examples = 0

        for example in examples:
            decision = self.workflow.validate_issue(
                ValidationRequest(issue=example.issue, artifact_paths=example.artifact_paths, provider=provider)
            )
            audit_payload = self._load_audit_payload(decision)
            overlap = self._missing_item_overlap(example.expected_missing_items, decision.missing_items)
            evidence_precision = self._evidence_precision_proxy(example.expected_evidence_refs, decision.evidence_used)
            evidence_recall = self._evidence_recall_proxy(example.expected_evidence_refs, decision.evidence_used)
            faithfulness = self._faithfulness_proxy(decision, audit_payload)
            contradiction_alignment = self._contradiction_alignment(example.expected_contradictions, decision.contradictions)
            results.append(
                EvaluationExampleResult(
                    issue_key=example.issue.issue_key,
                    expected_classification=example.expected_classification,
                    actual_classification=decision.classification,
                    expected_ready_for_dev=example.expected_ready_for_dev,
                    actual_ready_for_dev=decision.ready_for_dev,
                    expected_is_complete=example.expected_is_complete,
                    actual_is_complete=decision.is_complete,
                    missing_item_overlap=overlap,
                    confidence=decision.confidence,
                    evidence_precision_proxy=evidence_precision,
                    evidence_recall_proxy=evidence_recall,
                    faithfulness_proxy=faithfulness,
                    contradiction_alignment=contradiction_alignment,
                )
            )
            classification_hits += int(decision.classification == example.expected_classification)
            complete_hits += int(decision.is_complete == example.expected_is_complete)
            ready_hits += int(decision.ready_for_dev == example.expected_ready_for_dev)
            false_positive_bug += int(example.expected_classification == "not_bug" and decision.classification == "bug")
            false_ready_for_dev += int(not example.expected_ready_for_dev and decision.ready_for_dev)
            evidence_coverage += float(bool(decision.evidence_used))
            annotated_evidence_examples += int(bool(example.expected_evidence_refs))
            annotated_contradiction_examples += int(bool(example.expected_contradictions))

        total = max(len(results), 1)
        metrics = [
            EvaluationMetric(name="classification_accuracy", value=classification_hits / total),
            EvaluationMetric(name="completeness_accuracy", value=complete_hits / total),
            EvaluationMetric(name="ready_for_dev_accuracy", value=ready_hits / total),
            EvaluationMetric(name="avg_missing_item_overlap", value=sum(item.missing_item_overlap for item in results) / total),
            EvaluationMetric(name="avg_confidence", value=sum(item.confidence for item in results) / total),
            EvaluationMetric(name="false_positive_bug_rate", value=false_positive_bug / total),
            EvaluationMetric(name="false_ready_for_dev_rate", value=false_ready_for_dev / total),
            EvaluationMetric(name="evidence_coverage", value=evidence_coverage / total),
        ]
        if use_ragas_style_metrics:
            metrics.extend(
                [
                    EvaluationMetric(
                        name="answer_correctness_proxy",
                        value=sum(self._answer_correctness_proxy(item) for item in results) / total,
                    ),
                    EvaluationMetric(
                        name="faithfulness_proxy",
                        value=sum(item.faithfulness_proxy for item in results) / total,
                    ),
                    EvaluationMetric(
                        name="context_precision_proxy",
                        value=(sum(item.evidence_precision_proxy for item in results) / annotated_evidence_examples)
                        if annotated_evidence_examples
                        else 0.0,
                    ),
                    EvaluationMetric(
                        name="context_recall_proxy",
                        value=(sum(item.evidence_recall_proxy for item in results) / annotated_evidence_examples)
                        if annotated_evidence_examples
                        else 0.0,
                    ),
                    EvaluationMetric(
                        name="contradiction_alignment",
                        value=(sum(item.contradiction_alignment for item in results) / annotated_contradiction_examples)
                        if annotated_contradiction_examples
                        else 0.0,
                    ),
                ]
            )
        ragas_metrics, ragas_runtime_available = self._compute_ragas_runtime_metrics(results) if use_ragas_runtime else ([], False)
        classification_accuracy = classification_hits / total
        threshold = getattr(getattr(self.workflow, "settings", None), "auto_improvement_threshold", 0.75)
        needs_improvement = classification_accuracy < threshold
        return EvaluationResponse(
            dataset_path=str(path),
            total_examples=len(results),
            metrics=metrics,
            examples=results,
            ragas_metrics=ragas_metrics,
            ragas_runtime_available=ragas_runtime_available,
            needs_improvement=needs_improvement,
        )

    def auto_improve(
        self,
        golden_path: str | Path | None = None,
        optimizer: str = "bootstrap",
        provider: str = "openai",
    ) -> dict:
        """
        Auto-improvement loop — from article: Criando arquitetura de treinamento
        para agentes de IA com autoaperfeiçoamento.

        Evaluates against the golden dataset; if classification_accuracy is below
        auto_improvement_threshold, runs DSPy optimization and exports improved
        prompt files back to the prompts/ directory.

        Returns a dict with keys: triggered, dev_score, optimizer, exported_files.
        """
        from jira_issue_rag.services.dspy_optimizer import DSPyOptimizationLab

        settings = getattr(self.workflow, "settings", None)
        dataset = golden_path or (settings.golden_dataset_path if settings else "examples/golden_dataset.json")
        result = self.evaluate(dataset)
        if not result.needs_improvement:
            return {"triggered": False, "dev_score": None, "optimizer": None, "exported_files": []}

        lab = DSPyOptimizationLab(settings)
        lab.configure_lm(provider=provider)
        opt_result = lab.optimize(golden_path=dataset, optimizer=optimizer)
        output_dir = settings.prompts_dir if settings else Path("prompts")
        exported = lab.export_to_prompts(opt_result["program"], output_dir=output_dir)
        return {
            "triggered": True,
            "dev_score": opt_result.get("dev_score"),
            "optimizer": optimizer,
            "exported_files": exported,
        }

    def compare_scenarios(
        self,
        dataset_path: str | Path,
        scenarios: list[EvaluationScenario],
        use_ragas_style_metrics: bool = True,
        use_ragas_runtime: bool = False,
        write_report: bool = True,
    ) -> ComparisonResponse:
        if not scenarios:
            scenarios = self._default_scenarios()

        scenario_results: list[ScenarioEvaluationResult] = []
        for scenario in scenarios:
            workflow = self._build_workflow_for_scenario(scenario)
            evaluator = GoldenDatasetEvaluator(workflow)
            result = evaluator.evaluate(
                dataset_path=dataset_path,
                provider=scenario.provider,
                use_ragas_style_metrics=use_ragas_style_metrics,
                use_ragas_runtime=use_ragas_runtime,
            )
            scenario_results.append(
                ScenarioEvaluationResult(
                    scenario=scenario,
                    total_examples=result.total_examples,
                    metrics=result.metrics,
                    ragas_metrics=result.ragas_metrics,
                    ragas_runtime_available=result.ragas_runtime_available,
                )
            )

        report_path = self._write_comparison_report(dataset_path, scenario_results) if write_report else None
        return ComparisonResponse(
            dataset_path=str(dataset_path),
            scenarios=scenario_results,
            report_path=report_path,
        )

    def replay_audits(self, audit_dir: str | Path, provider: str | None = None, limit: int = 20) -> ReplayResponse:
        root = Path(audit_dir)
        audit_files = sorted(root.glob("*/*.json"), key=lambda path: path.stat().st_mtime, reverse=True)[:limit]
        results: list[ReplayExampleResult] = []

        for path in audit_files:
            payload = json.loads(path.read_text(encoding="utf-8"))
            issue = IssueCanonical.model_validate(payload["issue"])
            artifact_paths = [
                artifact["source_path"]
                for artifact in payload.get("attachment_facts", {}).get("artifacts", [])
                if Path(artifact["source_path"]).exists()
            ]
            baseline = DecisionResult.model_validate(payload["decision"])
            replay = self.workflow.validate_issue(
                ValidationRequest(issue=issue, artifact_paths=artifact_paths, provider=provider)
            )
            results.append(
                ReplayExampleResult(
                    issue_key=issue.issue_key,
                    baseline_classification=baseline.classification,
                    replay_classification=replay.classification,
                    baseline_ready_for_dev=baseline.ready_for_dev,
                    replay_ready_for_dev=replay.ready_for_dev,
                    baseline_is_complete=baseline.is_complete,
                    replay_is_complete=replay.is_complete,
                    baseline_confidence=baseline.confidence,
                    replay_confidence=replay.confidence,
                    classification_changed=baseline.classification != replay.classification,
                    readiness_changed=baseline.ready_for_dev != replay.ready_for_dev,
                    completeness_changed=baseline.is_complete != replay.is_complete,
                )
            )

        total = max(len(results), 1)
        metrics = [
            EvaluationMetric(
                name="classification_drift_rate",
                value=sum(item.classification_changed for item in results) / total,
            ),
            EvaluationMetric(
                name="ready_for_dev_drift_rate",
                value=sum(item.readiness_changed for item in results) / total,
            ),
            EvaluationMetric(
                name="completeness_drift_rate",
                value=sum(item.completeness_changed for item in results) / total,
            ),
            EvaluationMetric(
                name="avg_confidence_delta",
                value=sum(abs(item.replay_confidence - item.baseline_confidence) for item in results) / total,
            ),
        ]
        return ReplayResponse(
            audit_dir=str(root),
            total_examples=len(results),
            metrics=metrics,
            examples=results,
        )

    @staticmethod
    def _missing_item_overlap(expected: list[str], actual: list[str]) -> float:
        expected_set = set(expected)
        actual_set = set(actual)
        if not expected_set and not actual_set:
            return 1.0
        if not expected_set:
            return 0.0
        return len(expected_set & actual_set) / len(expected_set)

    @staticmethod
    def _evidence_precision_proxy(expected: list[str], actual: list[str]) -> float:
        expected_set = set(expected)
        actual_set = set(actual)
        if not expected_set:
            return 0.0
        if not actual_set:
            return 0.0
        return len(expected_set & actual_set) / len(actual_set)

    @staticmethod
    def _evidence_recall_proxy(expected: list[str], actual: list[str]) -> float:
        expected_set = set(expected)
        actual_set = set(actual)
        if not expected_set:
            return 0.0
        return len(expected_set & actual_set) / len(expected_set)

    @staticmethod
    def _contradiction_alignment(expected: list[str], actual: list[str]) -> float:
        expected_set = set(expected)
        actual_set = set(actual)
        if not expected_set and not actual_set:
            return 1.0
        if not expected_set:
            return 0.0
        return len(expected_set & actual_set) / len(expected_set)

    @staticmethod
    def _answer_correctness_proxy(result: EvaluationExampleResult) -> float:
        components = [
            float(result.expected_classification == result.actual_classification),
            float(result.expected_ready_for_dev == result.actual_ready_for_dev),
            float(result.expected_is_complete == result.actual_is_complete),
        ]
        return sum(components) / len(components)

    @staticmethod
    def _faithfulness_proxy(decision: DecisionResult, audit_payload: dict | None) -> float:
        if audit_payload is None:
            return 0.0
        retrieved_sources = {
            item.get("source")
            for item in audit_payload.get("retrieved", [])
            if isinstance(item, dict) and item.get("source")
        }
        rule_contradictions = set(audit_payload.get("rule_evaluation", {}).get("contradictions", []))
        evidence_grounded = set(decision.evidence_used).issubset(retrieved_sources) if decision.evidence_used else False
        contradiction_grounded = set(decision.contradictions).issubset(rule_contradictions) if decision.contradictions else True
        return (float(evidence_grounded) + float(contradiction_grounded)) / 2.0

    @staticmethod
    def _load_audit_payload(decision: DecisionResult) -> dict | None:
        if not decision.audit_path:
            return None
        path = Path(decision.audit_path)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def _compute_ragas_runtime_metrics(self, results: list[EvaluationExampleResult]) -> tuple[list[EvaluationMetric], bool]:
        if not importlib.util.find_spec("ragas"):
            return [], False

        try:
            return self._compute_ragas_v3(results)
        except Exception:  # pragma: no cover
            return [], False

    @staticmethod
    def _compute_ragas_v3(results: list[EvaluationExampleResult]) -> tuple[list[EvaluationMetric], bool]:
        """RAGAS v0.3+ evaluation using EvaluationDataset + evaluate()."""
        from ragas import evaluate  # type: ignore[import-untyped]
        from ragas.dataset_schema import EvaluationDataset, SingleTurnSample  # type: ignore[import-untyped]
        from ragas.metrics import (  # type: ignore[import-untyped]
            BleuScore,
            ExactMatch,
            NonLLMStringSimilarity,
            RougeScore,
        )

        samples = [
            SingleTurnSample(
                user_input=f"Classify issue {item.issue_key}: is it a bug, complete and ready for dev?",
                response=(
                    f"classification={item.actual_classification};"
                    f"complete={item.actual_is_complete};"
                    f"ready_for_dev={item.actual_ready_for_dev}"
                ),
                reference=(
                    f"classification={item.expected_classification};"
                    f"complete={item.expected_is_complete};"
                    f"ready_for_dev={item.expected_ready_for_dev}"
                ),
            )
            for item in results
        ]
        dataset = EvaluationDataset(samples=samples)
        non_llm_metrics = [
            ExactMatch(),
            BleuScore(),
            RougeScore(),
            NonLLMStringSimilarity(),
        ]
        result = evaluate(dataset=dataset, metrics=non_llm_metrics)
        # result behaves like a dict: {metric_name: float}
        output: list[EvaluationMetric] = []
        for metric_name, score in result.items():
            try:
                output.append(EvaluationMetric(name=f"ragas_{metric_name}", value=float(score)))
            except (TypeError, ValueError):
                pass
        return output, True

    @staticmethod
    def _serialize_expected_result(result: EvaluationExampleResult) -> str:
        return (
            f"classification={result.expected_classification};"
            f"complete={result.expected_is_complete};"
            f"ready_for_dev={result.expected_ready_for_dev}"
        )

    @staticmethod
    def _serialize_actual_result(result: EvaluationExampleResult) -> str:
        return (
            f"classification={result.actual_classification};"
            f"complete={result.actual_is_complete};"
            f"ready_for_dev={result.actual_ready_for_dev}"
        )

    def _default_scenarios(self) -> list[EvaluationScenario]:
        scenarios = [
            EvaluationScenario(
                name="baseline-local-no-rerank",
                provider="mock",
                enable_reranker=False,
                enable_external_retrieval=False,
                enable_langgraph=False,
            ),
            EvaluationScenario(
                name="local-rerank",
                provider="mock",
                enable_reranker=True,
                enable_external_retrieval=False,
                enable_langgraph=True,
            ),
            EvaluationScenario(
                name="hybrid-current",
                provider=(
                    self.workflow.settings.default_provider
                    if self.workflow.settings.allows_provider(self.workflow.settings.default_provider)
                    else "mock"
                ),
                enable_reranker=True,
                enable_external_retrieval=self.workflow.settings.external_vector_store_enabled(),
                enable_langgraph=self.workflow.settings.enable_langgraph,
            ),
        ]
        if self.workflow.settings.openai_api_key and self.workflow.settings.allows_provider("openai"):
            scenarios.append(
                EvaluationScenario(
                    name="openai-current",
                    provider="openai",
                    enable_reranker=True,
                    enable_external_retrieval=self.workflow.settings.external_vector_store_enabled(),
                    enable_langgraph=True,
                )
            )
        if self.workflow.settings.gcp_project_id and self.workflow.settings.allows_provider("gemini"):
            scenarios.append(
                EvaluationScenario(
                    name="gemini-current",
                    provider="gemini",
                    enable_reranker=True,
                    enable_external_retrieval=self.workflow.settings.external_vector_store_enabled(),
                    enable_langgraph=True,
                )
            )
        return scenarios

    def _build_workflow_for_scenario(self, scenario: EvaluationScenario):
        values = self.workflow.settings.model_dump()
        values.update(
            {
                "default_provider": scenario.provider or values.get("default_provider", "mock"),
                "enable_reranker": scenario.enable_reranker,
                "enable_external_retrieval": scenario.enable_external_retrieval,
                "enable_langgraph": scenario.enable_langgraph,
            }
        )
        settings = Settings.model_validate(values)
        if settings.confidentiality_mode:
            settings.enable_external_retrieval = settings.external_vector_store_enabled() and scenario.enable_external_retrieval
            if not settings.allows_provider(settings.default_provider):
                settings.default_provider = "mock"
            if not settings.allows_provider(settings.secondary_provider):
                settings.secondary_provider = "mock"
        settings.audit_dir.mkdir(parents=True, exist_ok=True)
        settings.staging_dir.mkdir(parents=True, exist_ok=True)
        settings.eval_reports_dir.mkdir(parents=True, exist_ok=True)
        return self.workflow.__class__(settings=settings)

    def _write_comparison_report(
        self,
        dataset_path: str | Path,
        scenarios: list[ScenarioEvaluationResult],
    ) -> str:
        report_dir = self.workflow.settings.eval_reports_dir
        report_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = report_dir / f"comparison_{timestamp}.json"
        payload: dict[str, Any] = {
            "dataset_path": str(dataset_path),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "scenarios": [scenario.model_dump(mode="json") for scenario in scenarios],
        }
        path.write_bytes(orjson.dumps(payload, option=orjson.OPT_INDENT_2))
        return str(path)
