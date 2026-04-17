"""FastAPI server for the TEE negotiation service.

Routes (PLAN §3.3):
  POST /negotiate   — main negotiation endpoint
  GET  /pubkey      — return X25519 public key + enclave metadata
  GET  /health      — liveness + readiness

mTLS: enabled when TLS_CERT + TLS_KEY env vars are set (uvicorn ssl kwargs).
Plain HTTP: allowed when ALLOW_PLAIN=1 (logs warning).
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .keys import enclave_id, signer_address, tee_pubkey
from .negotiate import negotiate
from .parse_conditions import DEFAULT_MODEL
from .schemas import NegotiateRequest, TeeAttestation

_logger = logging.getLogger("haggle_tee.server")

app = FastAPI(title="Haggle TEE Service", version="0.1.0")


# ── Security warning for plain HTTP ────────────────────────────
if not (os.environ.get("TLS_CERT") and os.environ.get("TLS_KEY")):
    if os.environ.get("ALLOW_PLAIN") == "1":
        _logger.warning(
            "ALLOW_PLAIN=1: running without TLS. "
            "This is acceptable for local dev only — never in production."
        )
    else:
        _logger.warning(
            "TLS_CERT / TLS_KEY not set and ALLOW_PLAIN != 1. "
            "Start uvicorn with --ssl-certfile / --ssl-keyfile or set ALLOW_PLAIN=1."
        )


# ── Global exception handler ────────────────────────────────────
@app.exception_handler(Exception)
async def _global_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all: return generic 500. Never leak decrypted data."""
    _logger.error("Unhandled exception: %s", type(exc).__name__)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": "An internal error occurred."},
    )


# ── Routes ──────────────────────────────────────────────────────


@app.post("/negotiate", response_model=TeeAttestation)
async def negotiate_route(req: NegotiateRequest) -> TeeAttestation:
    """Run the TEE negotiation pipeline.

    All sensitive values are contained inside `negotiate()`.
    This handler never accesses plaintext prices or conditions directly.
    """
    try:
        return await negotiate(req)
    except Exception as exc:
        # Log type only — never the message which might contain sensitive data
        _logger.error("negotiate() raised %s", type(exc).__name__)
        return JSONResponse(  # type: ignore[return-value]
            status_code=500,
            content={"error": "negotiate_failed", "detail": "Negotiation pipeline failed."},
        )


@app.get("/pubkey")
async def pubkey_route() -> dict[str, str]:
    """Return enclave X25519 public key and metadata."""
    model_id = os.environ.get("NEAR_AI_MODEL", DEFAULT_MODEL)
    return {
        "pubkey": "0x" + tee_pubkey().hex(),
        "enclaveId": "0x" + enclave_id().hex(),
        "modelId": model_id,
        "signerAddress": signer_address(),
    }


@app.get("/health")
async def health_route() -> dict[str, object]:
    """Liveness probe."""
    model_id = os.environ.get("NEAR_AI_MODEL", DEFAULT_MODEL)
    return {
        "ok": True,
        "enclaveId": "0x" + enclave_id().hex(),
        "modelId": model_id,
    }
