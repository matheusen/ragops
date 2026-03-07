from __future__ import annotations

from jira_issue_rag.shared.models import AttachmentFacts, IssueCanonical, RuleEvaluation, RuleResult


class RulesEngine:
    def evaluate(self, issue: IssueCanonical, attachment_facts: AttachmentFacts) -> RuleEvaluation:
        missing_items: list[str] = []
        results: list[RuleResult] = []

        required_values = {
            "expected_result_detail": issue.expected_behavior,
            "actual_result_detail": issue.actual_behavior,
            "environment": issue.environment,
            "affected_version_confirmation": issue.affected_version,
        }
        for label, value in required_values.items():
            if not value:
                missing_items.append(label)

        if not issue.reproduction_steps:
            missing_items.append("reproduction_steps")

        if issue.issue_type.lower() != "bug":
            results.append(
                RuleResult(
                    rule_name="issue_type_mismatch",
                    severity="warning",
                    message=f"Issue type is {issue.issue_type}, not Bug",
                )
            )

        contradictions = list(attachment_facts.contradictions)
        if attachment_facts.missing_information:
            results.append(
                RuleResult(
                    rule_name="artifact_information_missing",
                    severity="warning",
                    message="Some artifacts could not be fully parsed",
                    metadata={"items": attachment_facts.missing_information},
                )
            )

        combined_text = " ".join(
            [issue.summary, issue.description, issue.actual_behavior, issue.expected_behavior, " ".join(issue.labels)]
            + [artifact.extracted_text for artifact in attachment_facts.artifacts]
        ).lower()
        financial_impact_detected = any(
            token in combined_text for token in ("charge", "charged", "debit", "refund", "pix", "payment", "amount", "ledger")
        )
        if financial_impact_detected:
            results.append(
                RuleResult(
                    rule_name="financial_impact_detected",
                    severity="critical",
                    message="Issue contains financial language or monetary evidence",
                )
            )

        for artifact in attachment_facts.artifacts:
            amount_sums = artifact.facts.get("amount_sums") or {}
            if len(amount_sums) >= 2:
                col_values = list(amount_sums.values())
                if max(col_values) - min(col_values) > 0.01:
                    contradictions.append(f"Financial totals mismatch in {artifact.source_path}")
                    results.append(
                        RuleResult(
                            rule_name="financial_sum_mismatch",
                            severity="critical",
                            message=f"Detected mismatch between spreadsheet totals in {artifact.source_path}",
                            metadata={"amount_sums": amount_sums},
                        )
                    )

        # ── Cross-artifact financial reconciliation ──────────────────────────
        # Collect all declared totals and all itemised amounts across artifacts
        # so we can detect when a spreadsheet total disagrees with log evidence.
        spreadsheet_totals: list[tuple[str, float]] = []
        log_totals: list[tuple[str, float]] = []
        for artifact in attachment_facts.artifacts:
            declared = artifact.facts.get("total_amount")
            if declared is not None:
                if artifact.artifact_type in {"spreadsheet"}:
                    spreadsheet_totals.append((artifact.source_path, float(declared)))
                elif artifact.artifact_type in {"log", "text"}:
                    raw_amounts = artifact.facts.get("amounts") or []
                    if raw_amounts:
                        log_sum = sum(float(a) for a in raw_amounts)
                        log_totals.append((artifact.source_path, log_sum))

        if len(spreadsheet_totals) >= 2:
            st_values = [v for _, v in spreadsheet_totals]
            if max(st_values) - min(st_values) > 0.01:
                sources = ", ".join(p for p, _ in spreadsheet_totals)
                contradictions.append(f"Financial totals differ across spreadsheets: {sources}")
                results.append(
                    RuleResult(
                        rule_name="cross_artifact_spreadsheet_mismatch",
                        severity="critical",
                        message="Multiple spreadsheets report different total amounts",
                        metadata={"totals": {p: v for p, v in spreadsheet_totals}},
                    )
                )

        if spreadsheet_totals and log_totals:
            sheet_total = spreadsheet_totals[0][1]
            for log_path, log_sum in log_totals:
                tolerance = max(abs(sheet_total) * 0.001, 0.01)
                if abs(sheet_total - log_sum) > tolerance:
                    contradictions.append(
                        f"Spreadsheet total {sheet_total:.2f} differs from log-derived sum {log_sum:.2f} ({log_path})"
                    )
                    results.append(
                        RuleResult(
                            rule_name="cross_artifact_log_spreadsheet_mismatch",
                            severity="critical",
                            message="Log-derived amount sum does not match spreadsheet total",
                            metadata={
                                "spreadsheet_total": sheet_total,
                                "log_sum": log_sum,
                                "log_source": log_path,
                            },
                        )
                    )

        requires_human_review = bool(contradictions) or financial_impact_detected or bool(attachment_facts.missing_information)
        return RuleEvaluation(
            missing_items=sorted(set(missing_items)),
            contradictions=sorted(set(contradictions)),
            financial_impact_detected=financial_impact_detected,
            requires_human_review=requires_human_review,
            results=results,
        )
