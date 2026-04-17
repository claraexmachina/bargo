"""Key management for the TEE enclave.

- X25519 keypair: loaded from disk at `keys/x25519.priv` (32-byte raw) or generated.
- secp256k1 signer: loaded from TEE_SIGNER_PK env var (hex private key).
- enclave_id: keccak256(tee_pubkey || signer_address.encode())
"""

from __future__ import annotations

import os
from functools import cache
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from eth_account import Account
from eth_account.signers.local import LocalAccount
from eth_hash.auto import keccak

_KEYS_DIR = Path(__file__).parent.parent / "keys"
_X25519_PATH = _KEYS_DIR / "x25519.priv"


@cache
def _load_x25519() -> tuple[bytes, bytes]:
    """Return (private_key_bytes_32, public_key_bytes_32)."""
    if _X25519_PATH.exists():
        priv_bytes = _X25519_PATH.read_bytes()
        if len(priv_bytes) != 32:
            raise ValueError(f"x25519.priv must be 32 bytes, got {len(priv_bytes)}")
    else:
        _KEYS_DIR.mkdir(parents=True, exist_ok=True)
        priv_bytes = os.urandom(32)
        _X25519_PATH.write_bytes(priv_bytes)

    priv_key = X25519PrivateKey.from_private_bytes(priv_bytes)
    pub_key_obj = priv_key.public_key()
    pub_bytes = pub_key_obj.public_bytes_raw()
    return priv_bytes, pub_bytes


@cache
def _load_signer() -> LocalAccount:
    pk_hex = os.environ.get("TEE_SIGNER_PK", "")
    if not pk_hex:
        raise RuntimeError("TEE_SIGNER_PK environment variable not set")
    account: LocalAccount = Account.from_key(pk_hex)
    return account


def tee_privkey() -> bytes:
    """Return the raw 32-byte X25519 private key."""
    priv, _ = _load_x25519()
    return priv


def tee_pubkey() -> bytes:
    """Return the raw 32-byte X25519 public key."""
    _, pub = _load_x25519()
    return pub


def signer_account() -> LocalAccount:
    """Return the eth_account LocalAccount for EIP-712 signing."""
    return _load_signer()


def signer_address() -> str:
    """Return the Ethereum address (checksummed) of the enclave signer."""
    return _load_signer().address


def enclave_id() -> bytes:
    """Return bytes32 = keccak256(tee_pubkey || signer_address.encode())."""
    pub = tee_pubkey()
    addr = signer_address().encode()
    return keccak(pub + addr)
