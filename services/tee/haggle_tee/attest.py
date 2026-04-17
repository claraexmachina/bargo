"""EIP-712 signing helper for TEE attestations.

Domain:
  name:              "Haggle"
  version:           "1"
  chainId:           374  (Hoodi testnet; update if chain changes)
  verifyingContract: HAGGLE_ESCROW_ADDRESS env var

Types match AttestationLib.sol.
Returns 65-byte r||s||v hex (recoverable secp256k1 sig via eth_account).
"""

from __future__ import annotations

import os
from typing import Any

from eth_account import Account
from eth_account.messages import encode_typed_data

_CHAIN_ID = int(os.environ.get("CHAIN_ID", "374"))

# EIP-712 custom types (exclude EIP712Domain — eth_account handles domain separately)
_AGREEMENT_MESSAGE_TYPES: dict[str, list[dict[str, str]]] = {
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
}

_FAILURE_MESSAGE_TYPES: dict[str, list[dict[str, str]]] = {
    "TeeFailure": [
        {"name": "listingId", "type": "bytes32"},
        {"name": "offerId", "type": "bytes32"},
        {"name": "reasonHash", "type": "bytes32"},
        {"name": "modelId", "type": "string"},
        {"name": "enclaveId", "type": "bytes32"},
        {"name": "ts", "type": "uint256"},
        {"name": "nonce", "type": "bytes16"},
    ],
}


def _domain(verifying_contract: str) -> dict[str, Any]:
    return {
        "name": "Haggle",
        "version": "1",
        "chainId": _CHAIN_ID,
        "verifyingContract": verifying_contract,
    }


def _bytes32(hex_str: str) -> bytes:
    raw = bytes.fromhex(hex_str.removeprefix("0x"))
    return raw.ljust(32, b"\x00")[:32]


def _bytes16(hex_str: str) -> bytes:
    raw = bytes.fromhex(hex_str.removeprefix("0x"))
    return raw.ljust(16, b"\x00")[:16]


def sign_agreement(
    listing_id: str,
    offer_id: str,
    agreed_price: str,
    agreed_conditions: dict[str, str],
    model_id: str,
    enclave_id: str,
    ts: int,
    nonce: str,
    signer_key: str,
) -> str:
    """EIP-712-sign a TeeAgreement. Returns 65-byte hex signature."""
    contract = os.environ.get("HAGGLE_ESCROW_ADDRESS", "0x0000000000000000000000000000000000000000")
    message_data: dict[str, Any] = {
        "listingId": _bytes32(listing_id),
        "offerId": _bytes32(offer_id),
        "agreedPrice": int(agreed_price),
        "agreedConditions": agreed_conditions,
        "modelId": model_id,
        "enclaveId": _bytes32(enclave_id),
        "ts": ts,
        "nonce": _bytes16(nonce),
    }
    msg = encode_typed_data(
        domain_data=_domain(contract),
        message_types=_AGREEMENT_MESSAGE_TYPES,
        message_data=message_data,
    )
    signed = Account.sign_message(msg, private_key=signer_key)
    sig_bytes = (
        int(signed.r).to_bytes(32, "big")
        + int(signed.s).to_bytes(32, "big")
        + bytes([int(signed.v)])
    )
    return "0x" + sig_bytes.hex()


def sign_failure(
    listing_id: str,
    offer_id: str,
    reason_hash: str,
    model_id: str,
    enclave_id: str,
    ts: int,
    nonce: str,
    signer_key: str,
) -> str:
    """EIP-712-sign a TeeFailure. Returns 65-byte hex signature."""
    contract = os.environ.get("HAGGLE_ESCROW_ADDRESS", "0x0000000000000000000000000000000000000000")
    message_data: dict[str, Any] = {
        "listingId": _bytes32(listing_id),
        "offerId": _bytes32(offer_id),
        "reasonHash": _bytes32(reason_hash),
        "modelId": model_id,
        "enclaveId": _bytes32(enclave_id),
        "ts": ts,
        "nonce": _bytes16(nonce),
    }
    msg = encode_typed_data(
        domain_data=_domain(contract),
        message_types=_FAILURE_MESSAGE_TYPES,
        message_data=message_data,
    )
    signed = Account.sign_message(msg, private_key=signer_key)
    sig_bytes = (
        int(signed.r).to_bytes(32, "big")
        + int(signed.s).to_bytes(32, "big")
        + bytes([int(signed.v)])
    )
    return "0x" + sig_bytes.hex()
