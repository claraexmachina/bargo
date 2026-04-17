// Chain write operations — DEFERRED TO FRONTEND.
//
// The negotiation service does NOT submit on-chain transactions.
// Rationale:
//   - Gasless tx (US-4) requires the buyer's wallet signature (Status Network relayer).
//   - The service has no private key for user funds.
//   - registerListing() and submitOffer() are called from the user's wallet via wagmi/viem in apps/web.
//   - settleNegotiation() is called by either party after receiving the TEE attestation via /status.
//   - confirmMeetup() is called by both parties from their phones (QR scan flow, §2.12).
//
// The service's role is:
//   1. Store encrypted blobs off-chain.
//   2. Route to TEE for negotiation.
//   3. Return attestation for the frontend to submit on-chain.
//
// If the on-chain tx hash is available (frontend calls back via POST /attestation-receipt),
// the service records it in the negotiations table.
//
// This file is intentionally empty of implementation.
// Do not add chain write logic here without team consensus (§8 guardrails).

export {};
