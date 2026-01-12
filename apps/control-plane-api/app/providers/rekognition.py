from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.config import get_settings


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
        self._client = boto3.client("rekognition", region_name=settings.rekognition_region)

    def create_collection(self, collection_id: str) -> None:
        self._client.create_collection(CollectionId=collection_id)


_provider: RekognitionProvider | None = None


def get_rekognition_provider() -> RekognitionProvider:
    global _provider
    if _provider is not None:
        return _provider
    settings = get_settings()
    if settings.rekognition_mode == "aws":
        _provider = AwsRekognitionProvider()
    else:
        _provider = MockRekognitionProvider()
    return _provider
