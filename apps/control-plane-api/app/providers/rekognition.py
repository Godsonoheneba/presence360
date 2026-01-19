from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Protocol

from app.config import get_settings

logger = logging.getLogger(__name__)


class RekognitionNotConfiguredError(RuntimeError):
    def __init__(self, message: str, missing: list[str] | None = None) -> None:
        super().__init__(message)
        self.missing = missing or []


class RekognitionProvider(Protocol):
    def create_collection(self, collection_id: str) -> None:
        raise NotImplementedError


@dataclass
class MockRekognitionProvider:
    collections: set[str] = field(default_factory=set)

    def create_collection(self, collection_id: str) -> None:
        self.collections.add(collection_id)


class AwsRekognitionProvider:
    def __init__(self) -> None:
        import boto3

        settings = get_settings()
        region = (
            os.environ.get("AWS_REGION")
            or os.environ.get("AWS_DEFAULT_REGION")
            or settings.rekognition_region
        )
        self._region = region
        self._client = boto3.client("rekognition", region_name=region)

    def create_collection(self, collection_id: str) -> None:
        try:
            self._client.create_collection(CollectionId=collection_id)
        except Exception as exc:  # noqa: BLE001
            error_code = None
            retryable = False
            try:
                from botocore.exceptions import ClientError

                if isinstance(exc, ClientError):
                    error_code = exc.response.get("Error", {}).get("Code")
                    retryable = error_code in {
                        "ThrottlingException",
                        "ProvisionedThroughputExceededException",
                        "InternalServerError",
                        "TooManyRequestsException",
                    }
            except Exception:  # noqa: BLE001
                error_code = None
            logger.exception(
                "rekognition.create_collection_failed",
                extra={
                    "collection_id": collection_id,
                    "region": self._region,
                    "error_code": error_code,
                    "retryable": retryable,
                    "error_type": exc.__class__.__name__,
                },
            )
            raise


_provider: RekognitionProvider | None = None


def get_rekognition_provider() -> RekognitionProvider:
    global _provider
    if _provider is not None:
        return _provider
    settings = get_settings()
    if settings.rekognition_mode.lower() == "mock":
        _provider = MockRekognitionProvider()
        return _provider
    missing = _missing_aws_env()
    if missing:
        logger.error(
            "rekognition.not_configured",
            extra={"missing": missing},
        )
        raise RekognitionNotConfiguredError("rekognition_not_configured", missing=missing)
    _provider = AwsRekognitionProvider()
    return _provider


def _missing_aws_env() -> list[str]:
    missing: list[str] = []
    if not os.environ.get("AWS_ACCESS_KEY_ID"):
        missing.append("AWS_ACCESS_KEY_ID")
    if not os.environ.get("AWS_SECRET_ACCESS_KEY"):
        missing.append("AWS_SECRET_ACCESS_KEY")
    if not (os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")):
        missing.append("AWS_REGION")
    return missing
