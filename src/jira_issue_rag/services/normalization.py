from __future__ import annotations

import re

from jira_issue_rag.shared.models import IssueCanonical


class IssueNormalizer:
    def normalize(self, issue: IssueCanonical) -> IssueCanonical:
        issue.summary = issue.summary.strip()
        issue.description = self._collapse_blank_lines(issue.description)
        issue.expected_behavior = issue.expected_behavior.strip()
        issue.actual_behavior = issue.actual_behavior.strip()
        issue.comments = [comment.strip() for comment in issue.comments if comment.strip()]

        if not issue.acceptance_criteria:
            issue.acceptance_criteria = self._extract_prefixed_lines(issue.description, ("ac:", "acceptance:"))
        if not issue.reproduction_steps:
            issue.reproduction_steps = self._extract_prefixed_lines(issue.description, ("step", "steps:"))

        return issue

    @staticmethod
    def _collapse_blank_lines(text: str) -> str:
        return re.sub(r"\n{3,}", "\n\n", text.strip())

    @staticmethod
    def _extract_prefixed_lines(text: str, prefixes: tuple[str, ...]) -> list[str]:
        lines = []
        for line in text.splitlines():
            normalized = line.strip().lower()
            if any(normalized.startswith(prefix) for prefix in prefixes):
                lines.append(line.strip())
        return lines
