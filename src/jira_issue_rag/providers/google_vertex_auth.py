from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from jira_issue_rag.core.config import Settings


class GoogleVertexAuth:
    cloud_platform_scope = "https://www.googleapis.com/auth/cloud-platform"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def is_available(self) -> bool:
        if not self._credentials_file_exists():
            return False
        return self._google_auth_available() and bool(self.get_project_id())

    def get_project_id(self) -> str:
        if self.settings.gcp_project_id:
            return self.settings.gcp_project_id
        project_id = self._read_project_id_from_credentials_file()
        if project_id:
            return project_id
        raise RuntimeError("GCP_PROJECT_ID is not configured and could not be derived from the service account JSON")

    def get_access_token(self) -> str:
        if not self._google_auth_available():
            raise RuntimeError(
                "Google auth is not available. Install google-auth to use Vertex AI with a service account JSON"
            )
        request_cls = self._import_google_request()
        credentials = self._load_service_account_credentials()
        credentials.refresh(request_cls())
        if not credentials.token:
            raise RuntimeError("Unable to obtain Google Cloud access token for Vertex AI")
        return str(credentials.token)

    def build_predict_url(self, model_name: str) -> str:
        project_id = self.get_project_id()
        location = self.settings.gcp_location
        return (
            f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}/locations/{location}"
            f"/publishers/google/models/{model_name}:predict"
        )

    def build_generate_content_url(self, model_name: str) -> str:
        project_id = self.get_project_id()
        location = self.settings.gcp_location
        return (
            f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}/locations/{location}"
            f"/publishers/google/models/{model_name}:generateContent"
        )

    def build_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.get_access_token()}",
            "Content-Type": "application/json",
        }

    def _credentials_file_exists(self) -> bool:
        credentials_path = self._credentials_path()
        return bool(credentials_path and credentials_path.exists())

    def _credentials_path(self) -> Path | None:
        if not self.settings.google_application_credentials:
            return None
        return Path(self.settings.google_application_credentials)

    def _read_project_id_from_credentials_file(self) -> str | None:
        credentials_path = self._credentials_path()
        if credentials_path is None or not credentials_path.exists():
            return None
        payload = json.loads(credentials_path.read_text(encoding="utf-8"))
        project_id = payload.get("project_id")
        return str(project_id) if project_id else None

    def _load_service_account_credentials(self):
        credentials_path = self._credentials_path()
        if credentials_path is None or not credentials_path.exists():
            raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS must point to an existing service account JSON file")
        service_account = self._import_service_account()
        return service_account.Credentials.from_service_account_file(
            str(credentials_path),
            scopes=[self.cloud_platform_scope],
        )

    @staticmethod
    def _google_auth_available() -> bool:
        try:
            return bool(importlib.util.find_spec("google.auth"))
        except ModuleNotFoundError:
            return False

    @staticmethod
    def _import_google_request():
        from google.auth.transport.requests import Request

        return Request

    @staticmethod
    def _import_service_account():
        from google.oauth2 import service_account

        return service_account