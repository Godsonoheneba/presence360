from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

from .config import get_settings

PROVIDER_NAME = "rekognition"


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
                raise
            if exc.response.get("Error", {}).get("Code") != "ResourceAlreadyExistsException":
                raise

    def enroll(self, person_id: uuid.UUID, images: list[bytes]) -> dict[str, list[str]]:
        face_ids: list[str] = []
        warnings: list[str] = []
        for image_bytes in images:
            response = self._client.index_faces(
                CollectionId=self._collection_ref,
                Image={"Bytes": image_bytes},
                ExternalImageId=str(person_id),
                DetectionAttributes=[],
            )
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
        response = self._client.search_faces_by_image(
            CollectionId=self._collection_ref,
            Image={"Bytes": image_bytes},
            MaxFaces=5,
            FaceMatchThreshold=0,
        )
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
        response = self._client.delete_faces(
            CollectionId=self._collection_ref, FaceIds=face_ids
        )
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
    return _cached_provider(
        settings.rekognition_mode,
        collection_ref,
        settings.mock_face_confidence,
        settings.rekognition_region,
    )


def clear_face_provider_cache() -> None:
    _cached_provider.cache_clear()
