"""Negotiation orchestrator — TEE main logic (PRD §2.8).

SECURITY INVARIANTS (enforced throughout):
  - min_sell, max_buy, and decrypted condition strings NEVER appear in:
    - any logging call
    - any exception message surfaced to callers
    - any attestation payload field
  - safe_log() is the ONLY logging helper; it scrubs SENSITIVE_FIELDS before output.

Flow:
  1. Decrypt all 4 encrypted blobs with aad = listingId || offerId
  2. Parse min_sell / max_buy as int (decimal wei strings)
  3. Parallel parse_conditions for seller + buyer via LLM
  4. match_conditions — if incompatible → TeeFailure("conditions_incompatible")
  5. ZOPA check — if max_buy < min_sell → TeeFailure("no_price_zopa")
  6. agreed_price = floor(min_sell + (max_buy - min_sell) * karma_weight)
  7. EIP-712 sign TeeAgreement → TeeAttestation
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import time
from typing import Any

from eth_hash.auto import keccak

from .attest import sign_agreement, sign_failure
from .crypto import open_blob
from .karma_weight import karma_weight
from .keys import enclave_id as get_enclave_id
from .keys import signer_account, tee_privkey
from .match_conditions import Compatible, match
from .parse_conditions import DEFAULT_MODEL, parse_conditions
from .schemas import NegotiateRequest, TeeAgreement, TeeAttestation, TeeFailure

# ──────────────────────────────────────────────────────────────
# Privacy guardrails
# ──────────────────────────────────────────────────────────────
SENSITIVE_FIELDS: frozenset[str] = frozenset(
    ["min_sell", "max_buy", "seller_conditions", "buyer_conditions"]
)

_logger = logging.getLogger(__name__)


def safe_log(level: str, msg: str, **kwargs: Any) -> None:
    """Log *msg* only if it contains no sensitive field names."""
    combined = msg + str(kwargs)
    for field in SENSITIVE_FIELDS:
        if field in combined:
            return  # silently drop — never log sensitive data
    getattr(_logger, level)(msg, **kwargs)


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────


def _hex_to_aad(listing_id: str, offer_id: str) -> bytes:
    """Build 64-byte AAD = listingId (32b) || offerId (32b)."""
    lid = bytes.fromhex(listing_id.removeprefix("0x")).ljust(32, b"\x00")[:32]
    oid = bytes.fromhex(offer_id.removeprefix("0x")).ljust(32, b"\x00")[:32]
    return lid + oid


def _reason_hash(reason: str) -> str:
    """keccak256 of UTF-8 reason string, 0x-prefixed hex."""
    return "0x" + keccak(reason.encode()).hex()


def _enclave_id_hex() -> str:
    return "0x" + get_enclave_id().hex()


# ──────────────────────────────────────────────────────────────
# Main entrypoint
# ──────────────────────────────────────────────────────────────


async def negotiate(req: NegotiateRequest) -> TeeAttestation:
    """Orchestrate the full negotiation pipeline.

    All sensitive values (prices, condition strings) are kept in local
    variables only; they never enter logs, exceptions, or the output payload.
    """
    safe_log("info", "negotiate started", listing_id=req.listingId, offer_id=req.offerId)

    ts = int(time.time())
    model_id = os.environ.get("NEAR_AI_MODEL", DEFAULT_MODEL)
    enc_id_hex = _enclave_id_hex()
    sk = signer_account().key.hex()
    tee_sk = tee_privkey()

    aad = _hex_to_aad(req.listingId, req.offerId)

    # ── Step 1: Decrypt all 4 blobs ────────────────────────────
    # These variables are SENSITIVE — never log or re-raise their values.
    try:
        raw_min_sell = open_blob(req.encMinSell, aad, tee_sk).decode()
        raw_max_buy = open_blob(req.encMaxBuy, aad, tee_sk).decode()
        raw_seller_cond = open_blob(req.encSellerConditions, aad, tee_sk).decode()
        raw_buyer_cond = open_blob(req.encBuyerConditions, aad, tee_sk).decode()
    except Exception:
        safe_log("error", "decryption failed")
        raise RuntimeError("decryption failed") from None

    # ── Step 2: Parse prices ────────────────────────────────────
    try:
        min_sell = int(raw_min_sell.strip())
        max_buy = int(raw_max_buy.strip())
    except ValueError:
        safe_log("error", "price parse failed")
        raise RuntimeError("price parse failed") from None

    # ── Step 3: Parallel LLM condition parsing ──────────────────
    try:
        seller_struct, buyer_struct = await asyncio.gather(
            parse_conditions(raw_seller_cond, "seller"),
            parse_conditions(raw_buyer_cond, "buyer"),
        )
    except Exception:
        safe_log("error", "condition parse failed")
        # Return LLM timeout failure
        failure = TeeFailure(
            listingId=req.listingId,
            offerId=req.offerId,
            reasonHash=_reason_hash("llm_timeout"),
            modelId=model_id,
            enclaveId=enc_id_hex,
            ts=ts,
            nonce=req.nonce,
        )
        sig = sign_failure(
            req.listingId,
            req.offerId,
            failure.reasonHash,
            model_id,
            enc_id_hex,
            ts,
            req.nonce,
            sk,
        )
        return TeeAttestation(
            payload=failure,
            result="fail",
            signature=sig,
            signerAddress=signer_account().address,
        )

    # ── Step 4: Match conditions ────────────────────────────────
    match_result = match(seller_struct, buyer_struct)
    if not isinstance(match_result, Compatible):
        safe_log("info", "conditions incompatible", reason=match_result.reason_code)
        failure = TeeFailure(
            listingId=req.listingId,
            offerId=req.offerId,
            reasonHash=_reason_hash("conditions_incompatible"),
            modelId=model_id,
            enclaveId=enc_id_hex,
            ts=ts,
            nonce=req.nonce,
        )
        sig = sign_failure(
            req.listingId,
            req.offerId,
            failure.reasonHash,
            model_id,
            enc_id_hex,
            ts,
            req.nonce,
            sk,
        )
        return TeeAttestation(
            payload=failure,
            result="fail",
            signature=sig,
            signerAddress=signer_account().address,
        )

    # ── Step 5: ZOPA check ──────────────────────────────────────
    if max_buy < min_sell:
        safe_log("info", "no price ZOPA")
        failure = TeeFailure(
            listingId=req.listingId,
            offerId=req.offerId,
            reasonHash=_reason_hash("no_price_zopa"),
            modelId=model_id,
            enclaveId=enc_id_hex,
            ts=ts,
            nonce=req.nonce,
        )
        sig = sign_failure(
            req.listingId,
            req.offerId,
            failure.reasonHash,
            model_id,
            enc_id_hex,
            ts,
            req.nonce,
            sk,
        )
        return TeeAttestation(
            payload=failure,
            result="fail",
            signature=sig,
            signerAddress=signer_account().address,
        )

    # ── Step 6: Karma-weighted price ────────────────────────────
    weight = karma_weight(req.karmaTiers.seller, req.karmaTiers.buyer)
    agreed_price = math.floor(min_sell + (max_buy - min_sell) * weight)

    # ── Step 7: Build agreement and sign ───────────────────────
    agreed_conds = match_result.agreed
    agreement = TeeAgreement(
        listingId=req.listingId,
        offerId=req.offerId,
        agreedPrice=str(agreed_price),
        agreedConditions=agreed_conds,
        modelId=model_id,
        enclaveId=enc_id_hex,
        ts=ts,
        nonce=req.nonce,
    )

    sig = sign_agreement(
        req.listingId,
        req.offerId,
        str(agreed_price),
        {
            "location": agreed_conds.location,
            "meetTimeIso": agreed_conds.meetTimeIso,
            "payment": agreed_conds.payment,
        },
        model_id,
        enc_id_hex,
        ts,
        req.nonce,
        sk,
    )

    safe_log("info", "negotiate succeeded", listing_id=req.listingId, offer_id=req.offerId)
    return TeeAttestation(
        payload=agreement,
        result="agreement",
        signature=sig,
        signerAddress=signer_account().address,
    )
