from __future__ import annotations

import hashlib
import logging
import os
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

from .config import get_settings

PROVIDER_NAME = "rekognition"
logger = logging.getLogger(__name__)


class ProviderNotConfiguredError(RuntimeError):
    def __init__(self, message: str, error_code: str, missing: list[str] | None = None) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.missing = missing or []


@dataclass(frozen=True)
class FaceMatch:
    face_id: str
    confidence: float


@dataclass(frozen=True)
class RecognitionOutput:
    best_face_id: str | None
    best_confidence: float | None
    matches: list[FaceMatch]


class FaceProvider(Protocol):
    def ensure_collection(self) -> None:
        ...

    def enroll(self, person_id: uuid.UUID, images: list[bytes]) -> dict[str, list[str]]:
        ...

    def recognize(self, image_bytes: bytes) -> RecognitionOutput:
        ...

    def delete_face_ids(self, face_ids: list[str]) -> list[str]:
        ...


def _image_hash(image_bytes: bytes) -> str:
    return hashlib.sha256(image_bytes).hexdigest()


def _mock_face_id(image_bytes: bytes) -> str:
    return f"mock_{_image_hash(image_bytes)[:32]}"


class MockFaceProvider:
    def __init__(self, collection_ref: str, confidence: float) -> None:
        self._collection_ref = collection_ref
        self._confidence = confidence

    def ensure_collection(self) -> None:
        return None

    def enroll(self, person_id: uuid.UUID, images: list[bytes]) -> dict[str, list[str]]:
        face_ids: list[str] = []
        warnings: list[str] = []
        seen: set[str] = set()
        for image_bytes in images:
            face_id = _mock_face_id(image_bytes)
            if face_id in seen:
                warnings.append("duplicate_image")
                continue
            seen.add(face_id)
            face_ids.append(face_id)
        return {"face_ids": face_ids, "warnings": warnings}

    def recognize(self, image_bytes: bytes) -> RecognitionOutput:
        face_id = _mock_face_id(image_bytes)
        match = FaceMatch(face_id=face_id, confidence=self._confidence)
        return RecognitionOutput(
            best_face_id=face_id,
            best_confidence=self._confidence,
            matches=[match],
        )

    def delete_face_ids(self, face_ids: list[str]) -> list[str]:
        return face_ids


class RekognitionFaceProvider:
    def __init__(self, collection_ref: str, region: str) -> None:
        self._collection_ref = collection_ref
        self._region = region
        try:
            import boto3
        except ModuleNotFoundError as exc:  # noqa: PERF203
            raise RuntimeError("boto3 is required for Rekognition provider") from exc
        self._client = boto3.client("rekognition", region_name=region)

    def ensure_collection(self) -> None:
        try:
            self._client.create_collection(CollectionId=self._collection_ref)
        except Exception as exc:  # noqa: BLE001
            from botocore.exceptions import ClientError

            if not isinstance(exc, ClientError):
                _log_rekognition_error(
                    "create_collection",
                    exc,
                    self._collection_ref,
                    self._region,
                )
                raise
            if exc.response.get("Error", {}).get("Code") != "ResourceAlreadyExistsException":
                _log_rekognition_error(
                    "create_collection",
                    exc,
                    self._collection_ref,
                    self._region,
                )
                raise

    def enroll(self, person_id: uuid.UUID, images: list[bytes]) -> dict[str, list[str]]:
        face_ids: list[str] = []
        warnings: list[str] = []
        for image_bytes in images:
            try:
                response = self._client.index_faces(
                    CollectionId=self._collection_ref,
                    Image={"Bytes": image_bytes},
                    ExternalImageId=str(person_id),
                    DetectionAttributes=[],
                )
            except Exception as exc:  # noqa: BLE001
                _log_rekognition_error(
                    "index_faces",
                    exc,
                    self._collection_ref,
                    self._region,
                )
                raise
            records = response.get("FaceRecords", [])
            if not records:
                warnings.append("no_face_detected")
                continue
            for record in records:
                face = record.get("Face", {})
                face_id = face.get("FaceId")
                if face_id:
                    face_ids.append(face_id)
        return {"face_ids": face_ids, "warnings": warnings}

    def recognize(self, image_bytes: bytes) -> RecognitionOutput:
        try:
            response = self._client.search_faces_by_image(
                CollectionId=self._collection_ref,
                Image={"Bytes": image_bytes},
                MaxFaces=5,
                FaceMatchThreshold=0,
            )
        except Exception as exc:  # noqa: BLE001
            _log_rekognition_error(
                "search_faces_by_image",
                exc,
                self._collection_ref,
                self._region,
            )
            raise
        matches: list[FaceMatch] = []
        for match in response.get("FaceMatches", []):
            face = match.get("Face", {})
            face_id = face.get("FaceId")
            confidence = match.get("Similarity")
            if face_id is None or confidence is None:
                continue
            matches.append(FaceMatch(face_id=face_id, confidence=float(confidence)))
        matches.sort(key=lambda item: item.confidence, reverse=True)
        if matches:
            best = matches[0]
            return RecognitionOutput(
                best_face_id=best.face_id,
                best_confidence=best.confidence,
                matches=matches,
            )
        return RecognitionOutput(best_face_id=None, best_confidence=None, matches=[])

    def delete_face_ids(self, face_ids: list[str]) -> list[str]:
        if not face_ids:
            return []
        try:
            response = self._client.delete_faces(
                CollectionId=self._collection_ref, FaceIds=face_ids
            )
        except Exception as exc:  # noqa: BLE001
            _log_rekognition_error(
                "delete_faces",
                exc,
                self._collection_ref,
                self._region,
            )
            raise
        return response.get("DeletedFaces", [])


@lru_cache(maxsize=128)
def _cached_provider(
    mode: str,
    collection_ref: str,
    confidence: float,
    region: str,
) -> FaceProvider:
    if mode == "aws":
        return RekognitionFaceProvider(collection_ref=collection_ref, region=region)
    return MockFaceProvider(collection_ref=collection_ref, confidence=confidence)


def get_face_provider(collection_ref: str) -> FaceProvider:
    settings = get_settings()
    provider_mode = settings.provider_mode.lower()
    if provider_mode == "mock":
        return _cached_provider(
            "mock",
            collection_ref,
            settings.mock_face_confidence,
            settings.rekognition_region,
        )
    region = _resolve_region(settings.rekognition_region)
    missing = _missing_aws_env(region)
    if missing:
        raise ProviderNotConfiguredError(
            "rekognition_not_configured",
            error_code="rekognition_not_configured",
            missing=missing,
        )
    mode = "aws"
    return _cached_provider(
        mode,
        collection_ref,
        settings.mock_face_confidence,
        region,
    )


def clear_face_provider_cache() -> None:
    _cached_provider.cache_clear()


def _resolve_region(fallback: str) -> str:
    return os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or fallback


def _missing_aws_env(region: str | None) -> list[str]:
    missing: list[str] = []
    if not os.environ.get("AWS_ACCESS_KEY_ID"):
        missing.append("AWS_ACCESS_KEY_ID")
    if not os.environ.get("AWS_SECRET_ACCESS_KEY"):
        missing.append("AWS_SECRET_ACCESS_KEY")
    if not (os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")):
        missing.append("AWS_REGION")
    return missing


def _log_rekognition_error(
    action: str,
    exc: Exception,
    collection_ref: str,
    region: str,
) -> None:
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
        "rekognition.error",
        extra={
            "action": action,
            "collection_ref": collection_ref,
            "region": region,
            "error_code": error_code,
            "retryable": retryable,
        },
    )
