"""Test crypto.py against the golden fixture from packages/crypto/test/fixtures/golden-envelope.json.

The Python open_blob() MUST decrypt the same envelope that the TS seal() produced.
AAD = listingId (32 bytes) only. See PLAN §3.5 (updated).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from haggle_tee.crypto import open_blob, build_listing_aad
from haggle_tee.schemas import EncryptedBlob

FIXTURE_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "packages"
    / "crypto"
    / "test"
    / "fixtures"
    / "golden-envelope.json"
)


@pytest.fixture()
def golden() -> dict:  # type: ignore[type-arg]
    with open(FIXTURE_PATH) as f:
        return json.load(f)  # type: ignore[no-any-return]


def test_golden_fixture_exists() -> None:
    assert FIXTURE_PATH.exists(), f"Golden fixture not found at {FIXTURE_PATH}"


def test_decrypt_golden(golden: dict) -> None:  # type: ignore[type-arg]
    """Python open_blob() must recover the plaintext from the TS-generated fixture.
    AAD = listingId (32 bytes). No offerId. See PLAN §3.5 (updated).
    """
    blob = EncryptedBlob(**golden["blob"])
    tee_sk = bytes.fromhex(golden["teeSk"].removeprefix("0x"))
    aad = build_listing_aad(golden["listingId"])  # 32 bytes

    plaintext = open_blob(blob, aad, tee_sk)
    assert plaintext.decode() == golden["plaintext"]


def test_wrong_aad_fails(golden: dict) -> None:  # type: ignore[type-arg]
    """Authentication must fail with wrong AAD."""
    from nacl.exceptions import CryptoError

    blob = EncryptedBlob(**golden["blob"])
    tee_sk = bytes.fromhex(golden["teeSk"].removeprefix("0x"))
    bad_aad = b"\x00" * 32  # wrong AAD (different listingId → different 32 bytes)

    with pytest.raises(CryptoError):
        open_blob(blob, bad_aad, tee_sk)


def test_wrong_key_fails(golden: dict) -> None:  # type: ignore[type-arg]
    """Authentication must fail with wrong private key."""
    from nacl.exceptions import CryptoError

    blob = EncryptedBlob(**golden["blob"])
    wrong_sk = bytes(32)  # all-zero key
    aad = build_listing_aad(golden["listingId"])  # 32 bytes

    with pytest.raises(CryptoError):
        open_blob(blob, aad, wrong_sk)


def test_invalid_version_raises(golden: dict) -> None:  # type: ignore[type-arg]
    """open_blob() must reject unknown envelope versions."""
    data = dict(golden["blob"])
    data["v"] = 2  # unsupported version — override
    # Pydantic will reject v=2 because Literal[1] won't match
    with pytest.raises(Exception):
        EncryptedBlob(**data)
