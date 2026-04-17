#!/usr/bin/env bash
# Generate a self-signed TLS certificate for local dev / TEE mTLS testing.
# For hackathon: self-signed is fine.
# For production: use a CA-signed cert from NEAR AI Cloud.

set -euo pipefail

CERT_DIR="$(dirname "$0")/../certs"
mkdir -p "$CERT_DIR"

openssl req -x509 -newkey rsa:4096 \
  -keyout "$CERT_DIR/tee.key" \
  -out "$CERT_DIR/tee.crt" \
  -days 30 \
  -nodes \
  -subj "/C=KR/ST=Seoul/O=Haggle/CN=haggle-tee.local"

echo ""
echo "Certificate generated:"
echo "  Cert: $CERT_DIR/tee.crt"
echo "  Key:  $CERT_DIR/tee.key"
echo ""
echo "Set these env vars to enable TLS:"
echo "  TLS_CERT=$(realpath "$CERT_DIR/tee.crt")"
echo "  TLS_KEY=$(realpath "$CERT_DIR/tee.key")"
