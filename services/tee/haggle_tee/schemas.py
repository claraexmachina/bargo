"""Pydantic schemas mirroring packages/shared/src/types.ts (frozen)."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, field_validator

_HEX_RE = re.compile(r"^0x[0-9a-fA-F]+$")


def _validate_hex(v: str) -> str:
    if not _HEX_RE.match(v):
        raise ValueError(f"Not a valid hex string: {v!r}")
    return v


class EncryptedBlob(BaseModel):
    v: Literal[1]
    ephPub: str  # 0x-prefixed hex, 32 bytes (64 hex chars)
    nonce: str  # 0x-prefixed hex, 24 bytes (48 hex chars)
    ct: str  # 0x-prefixed hex, variable length

    @field_validator("ephPub", "nonce", "ct", mode="before")
    @classmethod
    def validate_hex(cls, v: object) -> str:
        if not isinstance(v, str):
            raise ValueError("Expected string")
        return _validate_hex(v)


class ListingMeta(BaseModel):
    title: str
    description: str = ""
    category: Literal["electronics", "fashion", "furniture", "other"] = "other"
    images: list[str] = []


class KarmaTiers(BaseModel):
    seller: int  # 0..3
    buyer: int  # 0..3


class NegotiateRequest(BaseModel):
    listingId: str
    offerId: str
    nonce: str  # bytes16 hex
    listingMeta: ListingMeta
    karmaTiers: KarmaTiers
    encMinSell: EncryptedBlob
    encSellerConditions: EncryptedBlob
    encMaxBuy: EncryptedBlob
    encBuyerConditions: EncryptedBlob


class TimeWindow(BaseModel):
    days: list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]]
    startHour: int  # 0-23 KST
    endHour: int  # 0-23 KST, exclusive


class ConditionStruct(BaseModel):
    location: list[str]
    timeWindow: TimeWindow
    payment: list[Literal["cash", "card", "transfer", "crypto"]]
    extras: list[str] = []


class AgreedConditions(BaseModel):
    location: str
    meetTimeIso: str  # ISO 8601 with +09:00
    payment: Literal["cash", "card", "transfer", "crypto"]


class TeeAgreement(BaseModel):
    listingId: str
    offerId: str
    agreedPrice: str  # wei decimal string
    agreedConditions: AgreedConditions
    modelId: str
    enclaveId: str
    ts: int
    nonce: str


class TeeFailure(BaseModel):
    listingId: str
    offerId: str
    reasonHash: str
    modelId: str
    enclaveId: str
    ts: int
    nonce: str


class TeeAttestation(BaseModel):
    payload: TeeAgreement | TeeFailure
    result: Literal["agreement", "fail"]
    signature: str  # 65-byte secp256k1 r||s||v hex
    signerAddress: str  # Ethereum address
