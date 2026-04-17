"""X25519 + HKDF-SHA256 + XChaCha20-Poly1305 decryption.

Mirrors packages/crypto/src/open.ts byte-for-byte.
Byte layout (PLAN §3.5):
  [0:32]  ephPub  (X25519 public key)
  [32:56] nonce   (XChaCha20, 24 bytes)
  [56:]   ciphertext + Poly1305 tag (16-byte trailer)

Derivation:
  shared  = X25519(tee_sk, ephPub)
  salt    = ephPub || teePub  (64 bytes)
  key     = HKDF-SHA256(shared, salt, info="haggle-v1", length=32)
  pt      = XChaCha20-Poly1305-Decrypt(key, nonce, ct, aad=listingId||offerId)
"""

from __future__ import annotations

from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from nacl.bindings import crypto_aead_xchacha20poly1305_ietf_decrypt

from .schemas import EncryptedBlob

_EPH_PUB_SIZE = 32
_NONCE_SIZE = 24


def _hex(h: str) -> bytes:
    """Strip 0x prefix and decode hex string to bytes."""
    return bytes.fromhex(h.removeprefix("0x"))


def _derive_key(shared: bytes, eph_pub: bytes, tee_pub: bytes) -> bytes:
    """HKDF-SHA256: salt=ephPub||teePub, info='haggle-v1', length=32."""
    salt = eph_pub + tee_pub
    hkdf = HKDF(algorithm=SHA256(), length=32, salt=salt, info=b"haggle-v1")
    return hkdf.derive(shared)


def open_blob(blob: EncryptedBlob, aad: bytes, tee_sk: bytes) -> bytes:
    """Decrypt *blob* and return plaintext bytes.

    Args:
        blob:   EncryptedBlob from the wire (JSON-deserialized).
        aad:    Additional authenticated data — listingId (32b) || offerId (32b).
        tee_sk: Raw 32-byte X25519 private key of the TEE enclave.

    Returns:
        Decrypted plaintext bytes.

    Raises:
        ValueError: on version mismatch.
        nacl.exceptions.CryptoError: on authentication failure.
    """
    if blob.v != 1:
        raise ValueError(f"Unsupported envelope version: {blob.v}")

    eph_pub_bytes = _hex(blob.ephPub)
    nonce = _hex(blob.nonce)
    ct = _hex(blob.ct)

    if len(eph_pub_bytes) != _EPH_PUB_SIZE:
        raise ValueError(f"ephPub must be {_EPH_PUB_SIZE} bytes, got {len(eph_pub_bytes)}")
    if len(nonce) != _NONCE_SIZE:
        raise ValueError(f"nonce must be {_NONCE_SIZE} bytes, got {len(nonce)}")

    # X25519 key exchange
    priv_key = X25519PrivateKey.from_private_bytes(tee_sk)
    tee_pub_bytes = priv_key.public_key().public_bytes_raw()
    peer_pub = X25519PublicKey.from_public_bytes(eph_pub_bytes)
    shared = priv_key.exchange(peer_pub)

    key = _derive_key(shared, eph_pub_bytes, tee_pub_bytes)

    # XChaCha20-Poly1305 decrypt via libsodium bindings (pynacl)
    plaintext: bytes = crypto_aead_xchacha20poly1305_ietf_decrypt(ct, aad, nonce, key)
    return plaintext
