from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from jira_issue_rag.core.config import Settings
from jira_issue_rag.shared.models import AttachmentMeta, ChangelogEvent, IssueCanonical, IssueLink


class JiraClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def is_available(self) -> bool:
        return bool(self.settings.jira_base_url and self.settings.jira_user_email and self.settings.jira_api_token)

    def fetch_issue(self, issue_key: str) -> IssueCanonical:
        if not self.is_available():
            raise RuntimeError("Jira credentials are not configured")

        payload = self._get(
            f"/rest/api/3/issue/{issue_key}",
            params={
                "fields": ",".join(
                    [
                        "summary",
                        "description",
                        "comment",
                        "attachment",
                        "labels",
                        "priority",
                        "issuetype",
                        "status",
                        "project",
                        "components",
                        "environment",
                        "fixVersions",
                        "versions",
                        "issuelinks",
                    ]
                ),
                "expand": "renderedFields",
            },
        )
        changelog = self._get_all_changelog(issue_key)
        return self._normalize_issue(payload, changelog)

    def download_attachments(self, issue: IssueCanonical, target_dir: str | None = None) -> list[str]:
        if not self.is_available():
            raise RuntimeError("Jira credentials are not configured")

        destination = Path(target_dir) if target_dir else self.settings.staging_dir / issue.issue_key
        destination.mkdir(parents=True, exist_ok=True)

        downloaded: list[str] = []
        with httpx.Client(auth=(self.settings.jira_user_email or "", self.settings.jira_api_token or ""), verify=self.settings.jira_verify_ssl, timeout=60.0) as client:
            for attachment in issue.attachments:
                if not attachment.content_url:
                    continue
                response = client.get(attachment.content_url, headers={"Accept": "*/*"})
                response.raise_for_status()
                safe_name = attachment.filename.replace("/", "_").replace("\\", "_")
                path = destination / safe_name
                path.write_bytes(response.content)
                downloaded.append(str(path))
        return downloaded

    def _get_all_changelog(self, issue_key: str) -> list[dict[str, Any]]:
        start_at = 0
        values: list[dict[str, Any]] = []
        while True:
            payload = self._get(
                f"/rest/api/3/issue/{issue_key}/changelog",
                params={"startAt": start_at, "maxResults": 100},
            )
            batch = payload.get("values", [])
            values.extend(batch)
            start_at += len(batch)
            if payload.get("isLast", True) or not batch:
                break
        return values

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        base_url = (self.settings.jira_base_url or "").rstrip("/")
        url = f"{base_url}{path}"
        with httpx.Client(
            auth=(self.settings.jira_user_email or "", self.settings.jira_api_token or ""),
            verify=self.settings.jira_verify_ssl,
            timeout=45.0,
            headers={"Accept": "application/json"},
        ) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            return response.json()

    def _normalize_issue(self, payload: dict[str, Any], changelog_payload: list[dict[str, Any]]) -> IssueCanonical:
        fields = payload.get("fields", {})
        comments_payload = fields.get("comment", {})
        comments = comments_payload.get("comments", comments_payload if isinstance(comments_payload, list) else [])

        return IssueCanonical(
            issue_key=payload.get("key", ""),
            summary=self._extract_text(fields.get("summary")),
            description=self._extract_text(fields.get("description")),
            comments=[self._extract_text(comment.get("body")) for comment in comments if self._extract_text(comment.get("body"))],
            expected_behavior=self._infer_expected_behavior(fields),
            actual_behavior=self._infer_actual_behavior(fields),
            priority=self._nested_name(fields.get("priority")),
            issue_type=self._nested_name(fields.get("issuetype")) or "Bug",
            status=self._nested_name(fields.get("status")),
            project=self._nested_value(fields.get("project"), "key") or self._nested_name(fields.get("project")),
            component=self._extract_first_name(fields.get("components")),
            service=self._infer_service(fields),
            environment=self._extract_text(fields.get("environment")),
            affected_version=self._extract_first_name(fields.get("fixVersions") or fields.get("versions")),
            labels=[str(label) for label in fields.get("labels", [])],
            issue_links=self._normalize_links(fields.get("issuelinks", [])),
            attachments=self._normalize_attachments(fields.get("attachment", [])),
            changelog=self._normalize_changelog(changelog_payload),
        )

    def _infer_expected_behavior(self, fields: dict[str, Any]) -> str:
        description = self._extract_text(fields.get("description"))
        for line in description.splitlines():
            lowered = line.lower()
            if lowered.startswith("expected") or lowered.startswith("esperado"):
                return line.split(":", 1)[-1].strip()
        return ""

    def _infer_actual_behavior(self, fields: dict[str, Any]) -> str:
        description = self._extract_text(fields.get("description"))
        for line in description.splitlines():
            lowered = line.lower()
            if lowered.startswith("actual") or lowered.startswith("atual") or lowered.startswith("observed"):
                return line.split(":", 1)[-1].strip()
        return ""

    def _infer_service(self, fields: dict[str, Any]) -> str | None:
        component = self._extract_first_name(fields.get("components"))
        project = self._nested_value(fields.get("project"), "key")
        if component:
            return component
        if project:
            return f"{project.lower()}-service"
        return None

    def _normalize_attachments(self, attachments: list[dict[str, Any]]) -> list[AttachmentMeta]:
        normalized: list[AttachmentMeta] = []
        for item in attachments:
            normalized.append(
                AttachmentMeta(
                    filename=str(item.get("filename", "attachment")),
                    attachment_id=str(item.get("id")) if item.get("id") is not None else None,
                    path=None,
                    content_type=item.get("mimeType"),
                    content_url=item.get("content"),
                    size_bytes=item.get("size"),
                )
            )
        return normalized

    def _normalize_links(self, links: list[dict[str, Any]]) -> list[IssueLink]:
        normalized: list[IssueLink] = []
        for item in links:
            link_type = item.get("type", {})
            outward = item.get("outwardIssue")
            inward = item.get("inwardIssue")
            if outward:
                normalized.append(
                    IssueLink(
                        link_type=str(link_type.get("name", "link")),
                        key=str(outward.get("key", "")),
                        relation=str(link_type.get("outward")) if link_type.get("outward") else None,
                    )
                )
            if inward:
                normalized.append(
                    IssueLink(
                        link_type=str(link_type.get("name", "link")),
                        key=str(inward.get("key", "")),
                        relation=str(link_type.get("inward")) if link_type.get("inward") else None,
                    )
                )
        return normalized

    def _normalize_changelog(self, changelog_payload: list[dict[str, Any]]) -> list[ChangelogEvent]:
        events: list[ChangelogEvent] = []
        for history in changelog_payload:
            author = history.get("author", {}).get("displayName")
            changed_at = self._parse_datetime(history.get("created"))
            for item in history.get("items", []):
                events.append(
                    ChangelogEvent(
                        author=author,
                        field=str(item.get("field", "unknown")),
                        from_value=item.get("fromString"),
                        to_value=item.get("toString"),
                        changed_at=changed_at,
                    )
                )
        return events

    def _extract_text(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, dict):
            text_parts: list[str] = []
            if "text" in value and isinstance(value["text"], str):
                text_parts.append(value["text"])
            for item in value.get("content", []):
                text = self._extract_text(item)
                if text:
                    text_parts.append(text)
            return "\n".join(part for part in text_parts if part).strip()
        if isinstance(value, list):
            return "\n".join(part for item in value if (part := self._extract_text(item)))
        return str(value).strip()

    @staticmethod
    def _nested_name(value: Any) -> str | None:
        if isinstance(value, dict):
            return value.get("name")
        return None

    @staticmethod
    def _nested_value(value: Any, key: str) -> str | None:
        if isinstance(value, dict):
            nested = value.get(key)
            return str(nested) if nested is not None else None
        return None

    @staticmethod
    def _extract_first_name(values: Any) -> str | None:
        if isinstance(values, list) and values:
            first = values[0]
            if isinstance(first, dict):
                name = first.get("name") or first.get("value") or first.get("key")
                return str(name) if name is not None else None
        return None

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if not value or not isinstance(value, str):
            return None
        for fmt in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
        return None
