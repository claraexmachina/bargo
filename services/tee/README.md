# haggle-tee — NEAR AI Cloud TEE Service

FastAPI-based TEE negotiation service. Runs on NEAR AI Cloud (Intel TDX + GPU).

## LLM

- **Base URL**: `https://api.near.ai/v1`
- **Default model**: `llama-v3p1-8b-instruct` (fastest small model available on NEAR AI Cloud as of 2026-04)
- **Constant**: `haggle_tee.parse_conditions.DEFAULT_MODEL`

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `TEE_SIGNER_PK` | Yes | Hex secp256k1 private key for EIP-712 attestation signing |
| `NEAR_AI_API_KEY` | Yes (prod) | NEAR AI Cloud API key |
| `NEAR_AI_MODEL` | No | Override LLM model (default: `llama-v3p1-8b-instruct`) |
| `HAGGLE_ESCROW_ADDRESS` | Yes | Deployed HaggleEscrow address for EIP-712 domain |
| `CHAIN_ID` | No | EVM chain ID (default: `374` for Hoodi testnet) |
| `TLS_CERT` | No | Path to TLS certificate (enables mTLS) |
| `TLS_KEY` | No | Path to TLS private key |
| `ALLOW_PLAIN` | Dev only | Set `1` to run without TLS (logs a warning) |

## Run locally (uv)

```bash
cd services/tee

# Install dependencies
uv pip install -e ".[dev]"

# Set required env vars
export TEE_SIGNER_PK=0x<your-hex-pk>
export NEAR_AI_API_KEY=<your-near-ai-key>
export HAGGLE_ESCROW_ADDRESS=0x<deployed-address>
export ALLOW_PLAIN=1

# Start server
uvicorn haggle_tee.server:app --host 0.0.0.0 --port 8080 --reload
```

## Run with TLS (dev self-signed cert)

```bash
./scripts/gen_dev_cert.sh

export TLS_CERT=./certs/tee.crt
export TLS_KEY=./certs/tee.key

uvicorn haggle_tee.server:app \
  --host 0.0.0.0 --port 8080 \
  --ssl-certfile "$TLS_CERT" \
  --ssl-keyfile "$TLS_KEY"
```

## Run tests

```bash
cd services/tee
uv pip install -e ".[dev]"
export TEE_SIGNER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
pytest -v
```

## Lint & type-check

```bash
ruff check . && ruff format . && mypy haggle_tee
```

## Docker

```bash
docker build -t haggle-tee .
docker run -p 8080:8080 \
  -e TEE_SIGNER_PK=0x... \
  -e NEAR_AI_API_KEY=... \
  -e HAGGLE_ESCROW_ADDRESS=0x... \
  -e ALLOW_PLAIN=1 \
  haggle-tee
```

## Deploy to NEAR AI Cloud

1. Build and push the Docker image to a container registry.
2. Create a NEAR AI Cloud agent deployment pointing to the image.
3. Set environment variables in the NEAR AI Cloud dashboard.
4. The TEE will generate a fresh X25519 keypair on first start (stored at `keys/x25519.priv`).
5. Call `GET /pubkey` to retrieve the enclave public key and signer address.
6. Submit the signer address to contract-lead for `addEnclaveSigner` whitelisting.

## API

| Route | Method | Description |
|---|---|---|
| `/negotiate` | POST | Run the full negotiation pipeline |
| `/pubkey` | GET | Return X25519 pubkey + enclave metadata |
| `/health` | GET | Liveness probe |

## Security notes

- Plaintext prices and condition strings are decrypted inside `negotiate()` only.
- They never appear in logs, exceptions, or the attestation payload.
- `safe_log()` in `negotiate.py` scrubs SENSITIVE_FIELDS before any log call.
- The privacy test in `tests/test_negotiate.py` enforces this automatically.
- For production: pin the model via `NEAR_AI_MODEL` and verify `model_id` in attestations on-chain.
