"""End-to-end negotiate() tests with mocked LLM.

Includes:
  - Happy path → agreement, signature verifiable via eth_account
  - max_buy < min_sell → fail with no_price_zopa reason_hash
  - Condition mismatch (time) → fail with conditions_incompatible reason_hash
  - PRIVACY TEST: monkeypatch all logger methods, assert no sensitive data in any log call
"""

from __future__ import annotations

import json
import logging
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_hash.auto import keccak

# ── Test-only secp256k1 key ─────────────────────────────────────
_TEST_SK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
_TEST_ACCOUNT = Account.from_key(_TEST_SK)

# X25519 private key from golden fixture
_TEE_SK_HEX = "ab00000000000000000000000000000000000000000000000000000000000001"
_TEE_SK = bytes.fromhex(_TEE_SK_HEX)

# IDs for AAD
_LISTING_ID = "0xaa00000000000000000000000000000000000000000000000000000000000000"
_OFFER_ID = "0xbb00000000000000000000000000000000000000000000000000000000000000"


def _make_blob(plaintext: str) -> dict:  # type: ignore[type-arg]
    """Encrypt *plaintext* using the test TEE SK and return EncryptedBlob dict."""
    import os as _os

    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
    from cryptography.hazmat.primitives.hashes import SHA256
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from nacl.bindings import crypto_aead_xchacha20poly1305_ietf_encrypt

    tee_priv = X25519PrivateKey.from_private_bytes(_TEE_SK)
    tee_pub_bytes = tee_priv.public_key().public_bytes_raw()

    eph_sk_bytes = _os.urandom(32)
    eph_priv = X25519PrivateKey.from_private_bytes(eph_sk_bytes)
    eph_pub_bytes = eph_priv.public_key().public_bytes_raw()

    shared = eph_priv.exchange(X25519PublicKey.from_public_bytes(tee_pub_bytes))

    salt = eph_pub_bytes + tee_pub_bytes
    hkdf = HKDF(algorithm=SHA256(), length=32, salt=salt, info=b"haggle-v1")
    key = hkdf.derive(shared)

    nonce = _os.urandom(24)

    # AAD = listingId (32 bytes) only. See PLAN §3.5 (updated).
    from haggle_tee.crypto import build_listing_aad
    aad = build_listing_aad(_LISTING_ID)

    ct = crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext.encode(), aad, nonce, key)

    return {
        "v": 1,
        "ephPub": "0x" + eph_pub_bytes.hex(),
        "nonce": "0x" + nonce.hex(),
        "ct": "0x" + ct.hex(),
    }


def _fake_llm_client(response_json: dict) -> MagicMock:  # type: ignore[type-arg]
    content = json.dumps(response_json)
    message = MagicMock()
    message.content = content
    choice = MagicMock()
    choice.message = message
    completion = MagicMock()
    completion.choices = [choice]
    client = MagicMock()
    client.chat = MagicMock()
    client.chat.completions = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=completion)
    return client


_COMPATIBLE_CONDITIONS = {
    "location": ["gangnam"],
    "timeWindow": {"days": ["mon", "tue", "wed", "thu", "fri"], "startHour": 19, "endHour": 22},
    "payment": ["cash"],
    "extras": [],
}

_SELLER_WEEKDAY = {
    "location": ["gangnam"],
    "timeWindow": {"days": ["mon", "tue", "wed", "thu", "fri"], "startHour": 19, "endHour": 22},
    "payment": ["cash"],
    "extras": [],
}

_BUYER_WEEKEND = {
    "location": ["gangnam"],
    "timeWindow": {"days": ["sat", "sun"], "startHour": 10, "endHour": 18},
    "payment": ["cash"],
    "extras": [],
}


def _base_request() -> dict:  # type: ignore[type-arg]
    return {
        "listingId": _LISTING_ID,
        "offerId": _OFFER_ID,
        "nonce": "0x" + "00" * 16,
        "listingMeta": {"title": "MacBook M1", "category": "electronics"},
        "karmaTiers": {"seller": 3, "buyer": 1},
        "encMinSell": _make_blob("700000000000000000000000"),
        "encSellerConditions": _make_blob("강남 직거래만, 평일 19시 이후"),
        "encMaxBuy": _make_blob("750000000000000000000000"),
        "encBuyerConditions": _make_blob("강남 가능, 평일 가능"),
    }


@pytest.fixture(autouse=True)
def _patch_keys(tmp_path, monkeypatch):  # type: ignore[no-untyped-def]
    """Inject test keys into the keys module without touching disk."""
    monkeypatch.setenv("TEE_SIGNER_PK", _TEST_SK)

    # Patch tee_privkey to return our test SK
    monkeypatch.setattr(
        "haggle_tee.negotiate.tee_privkey",
        lambda: _TEE_SK,
    )
    # Patch enclave_id
    monkeypatch.setattr(
        "haggle_tee.negotiate.get_enclave_id",
        lambda: b"\xca" * 32,
    )
    # Patch signer_account to return test account
    monkeypatch.setattr(
        "haggle_tee.negotiate.signer_account",
        lambda: _TEST_ACCOUNT,
    )


@pytest.mark.asyncio
async def test_happy_path_agreement() -> None:
    """Full negotiation succeeds and produces a verifiable EIP-712 signature."""
    from haggle_tee.negotiate import negotiate
    from haggle_tee.schemas import NegotiateRequest, TeeAgreement

    req = NegotiateRequest(**_base_request())

    fake_client = _fake_llm_client(_COMPATIBLE_CONDITIONS)

    with patch("haggle_tee.parse_conditions._make_client", return_value=fake_client):
        result = await negotiate(req)

    assert result.result == "agreement"
    assert isinstance(result.payload, TeeAgreement)
    assert int(result.payload.agreedPrice) > 0
    assert result.signerAddress == _TEST_ACCOUNT.address

    # Verify the EIP-712 signature recovers to the expected signer
    from eth_account.messages import encode_typed_data

    payload = result.payload
    assert isinstance(payload, TeeAgreement)

    msg = encode_typed_data(
        domain_data={
            "name": "Haggle",
            "version": "1",
            "chainId": 374,
            "verifyingContract": "0x0000000000000000000000000000000000000000",
        },
        message_types={
            "AgreedConditions": [
                {"name": "location", "type": "string"},
                {"name": "meetTimeIso", "type": "string"},
                {"name": "payment", "type": "string"},
            ],
            "TeeAgreement": [
                {"name": "listingId", "type": "bytes32"},
                {"name": "offerId", "type": "bytes32"},
                {"name": "agreedPrice", "type": "uint256"},
                {"name": "agreedConditions", "type": "AgreedConditions"},
                {"name": "modelId", "type": "string"},
                {"name": "enclaveId", "type": "bytes32"},
                {"name": "ts", "type": "uint256"},
                {"name": "nonce", "type": "bytes16"},
            ],
        },
        message_data={
            "listingId": bytes.fromhex(payload.listingId.removeprefix("0x")).ljust(32, b"\x00")[:32],
            "offerId": bytes.fromhex(payload.offerId.removeprefix("0x")).ljust(32, b"\x00")[:32],
            "agreedPrice": int(payload.agreedPrice),
            "agreedConditions": {
                "location": payload.agreedConditions.location,
                "meetTimeIso": payload.agreedConditions.meetTimeIso,
                "payment": payload.agreedConditions.payment,
            },
            "modelId": payload.modelId,
            "enclaveId": bytes.fromhex(payload.enclaveId.removeprefix("0x")).ljust(32, b"\x00")[:32],
            "ts": payload.ts,
            "nonce": bytes.fromhex(payload.nonce.removeprefix("0x")).ljust(16, b"\x00")[:16],
        },
    )
    recovered = Account.recover_message(msg, signature=bytes.fromhex(result.signature.removeprefix("0x")))
    assert recovered.lower() == _TEST_ACCOUNT.address.lower()


@pytest.mark.asyncio
async def test_no_price_zopa() -> None:
    """max_buy < min_sell → TeeFailure with no_price_zopa reason_hash."""
    from haggle_tee.negotiate import negotiate, _reason_hash
    from haggle_tee.schemas import NegotiateRequest, TeeFailure

    req_dict = _base_request()
    # min_sell = 800, max_buy = 700 → no ZOPA
    req_dict["encMinSell"] = _make_blob("800000000000000000000000")
    req_dict["encMaxBuy"] = _make_blob("700000000000000000000000")
    req = NegotiateRequest(**req_dict)

    fake_client = _fake_llm_client(_COMPATIBLE_CONDITIONS)

    with patch("haggle_tee.parse_conditions._make_client", return_value=fake_client):
        result = await negotiate(req)

    assert result.result == "fail"
    assert isinstance(result.payload, TeeFailure)
    assert result.payload.reasonHash == _reason_hash("no_price_zopa")


@pytest.mark.asyncio
async def test_condition_mismatch_time() -> None:
    """Seller weekday-only / buyer weekend-only → conditions_incompatible."""
    from haggle_tee.negotiate import negotiate, _reason_hash
    from haggle_tee.schemas import NegotiateRequest, TeeFailure

    req = NegotiateRequest(**_base_request())

    call_count = 0

    async def _fake_parse(text: str, role, *, _client=None):  # type: ignore[no-untyped-def]
        nonlocal call_count
        call_count += 1
        from haggle_tee.schemas import ConditionStruct, TimeWindow

        if role == "seller":
            return ConditionStruct(
                location=["gangnam"],
                timeWindow=TimeWindow(days=["mon", "tue", "wed", "thu", "fri"], startHour=19, endHour=22),
                payment=["cash"],
            )
        else:
            return ConditionStruct(
                location=["gangnam"],
                timeWindow=TimeWindow(days=["sat", "sun"], startHour=10, endHour=18),
                payment=["cash"],
            )

    with patch("haggle_tee.negotiate.parse_conditions", _fake_parse):
        result = await negotiate(req)

    assert result.result == "fail"
    assert isinstance(result.payload, TeeFailure)
    assert result.payload.reasonHash == _reason_hash("conditions_incompatible")


@pytest.mark.asyncio
async def test_privacy_no_sensitive_data_in_logs() -> None:
    """PRIVACY TEST: sensitive values must never appear in any log call."""
    from haggle_tee.negotiate import negotiate
    from haggle_tee.schemas import NegotiateRequest

    captured_log_args: list[tuple] = []

    def _capture(*args: object, **kwargs: object) -> None:
        captured_log_args.append((args, kwargs))

    req = NegotiateRequest(**_base_request())
    fake_client = _fake_llm_client(_COMPATIBLE_CONDITIONS)

    # Monkeypatch ALL logger methods on the negotiate module's logger
    with (
        patch("haggle_tee.negotiate._logger") as mock_logger,
        patch("haggle_tee.parse_conditions._make_client", return_value=fake_client),
    ):
        for method in ("debug", "info", "warning", "error", "critical", "exception"):
            getattr(mock_logger, method).side_effect = _capture

        await negotiate(req)

    # Sensitive strings that must NEVER appear in any log
    sensitive_values = [
        "700000000000000000000000",  # min_sell plaintext
        "750000000000000000000000",  # max_buy plaintext
        "강남 직거래만, 평일 19시 이후",  # seller condition plaintext
        "강남 가능, 평일 가능",  # buyer condition plaintext
    ]

    all_log_text = " ".join(str(a) for call in captured_log_args for a in call[0])
    all_log_text += " ".join(str(v) for call in captured_log_args for v in call[1].values())

    for sensitive in sensitive_values:
        assert sensitive not in all_log_text, (
            f"PRIVACY VIOLATION: sensitive value {sensitive!r} found in log output"
        )
