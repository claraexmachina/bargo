# Bargo Contract Deployments

## Hoodi Testnet (chainId 374) — OBSOLETE (V1 — self-TEE)

**Status:** Not deployed — superseded by V2. V1 used an `enclaveSigner` whitelist and EIP-712 TEE signatures. See V2 section below.

---

## V2 — NEAR AI Attestation Relayer Model

**Status:** Not yet deployed — awaiting `DEPLOYER_PRIVATE_KEY` and `ATTESTATION_RELAYER_ADDRESS` from operator.

### What changed from V1

- Removed `enclaveSigner` whitelist and EIP-712 TEE signature verification.
- Added `attestationRelayer` address: a single wallet controlled by the negotiation service that calls `settleNegotiation`.
- `settleNegotiation` now records `agreedConditionsHash` and `nearAiAttestationHash` (keccak256 of the canonical NEAR AI attestation bundle) on the `Deal` struct.
- `NegotiationSettled` event indexes `nearAiAttestationHash` as the third topic so judges can filter by it.
- Constructor takes three arguments: `karmaReader_`, `rlnVerifier_`, `attestationRelayer_`.

### Key rotation procedure

If `ATTESTATION_RELAYER_ADDRESS` is compromised (threat model #7):

```bash
# Only the contract owner can rotate the relayer
cast send $BARGO_ESCROW_ADDRESS \
  "setAttestationRelayer(address)" \
  $NEW_RELAYER_ADDRESS \
  --rpc-url $HOODI_RPC_URL \
  --private-key $OWNER_PRIVATE_KEY
```

The `AttestationRelayerUpdated(address indexed previous, address indexed current)` event is emitted on rotation. Post-hackathon: upgrade to multisig owner for this call.

### Deploy Instructions

#### Prerequisites

1. Fund deployer wallet via [Hoodi faucet](https://hoodiscan.status.network) or Status Discord.
2. Derive `ATTESTATION_RELAYER_ADDRESS` from `RELAYER_PRIVATE_KEY` (e.g. `cast wallet address --private-key $RELAYER_PRIVATE_KEY`).

#### Step 1 — Set environment variables

```bash
export HOODI_RPC_URL=https://public.hoodi.rpc.status.network
export DEPLOYER_PRIVATE_KEY=<your-private-key>             # NEVER commit
export ATTESTATION_RELAYER_ADDRESS=<relayer-wallet-address> # derived from RELAYER_PRIVATE_KEY
```

#### Step 2 — Deploy

Status Network gasless is currently down (RLN prover bug announced by the org);
deploy with paid gas via explicit gas flags. Once gasless is restored, the same
command works — no changes needed.

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url $HOODI_RPC_URL \
  --broadcast \
  --with-gas-price 200gwei \
  --priority-gas-price 100gwei \
  --slow \
  --private-key $DEPLOYER_PRIVATE_KEY
```

Expected output:
```
RLNVerifier:       0x...
KarmaReader:       0x...
BargoEscrow:      0x...
attestationRelayer: 0x...
```

#### Step 3 — Seed demo wallets

```bash
export KARMA_READER_ADDRESS=<KarmaReader from step 2>
export ALICE_ADDRESS=<alice-wallet>
export BOB_ADDRESS=<bob-wallet>
export EVE_ADDRESS=<eve-wallet>

forge script script/Seed.s.sol \
  --rpc-url $HOODI_RPC_URL \
  --broadcast \
  --with-gas-price 200gwei \
  --priority-gas-price 100gwei \
  --slow \
  --private-key $DEPLOYER_PRIVATE_KEY
```

#### Step 4 — Update addresses

Edit `packages/shared/src/addresses.ts`:
```ts
export const ADDRESSES = {
  374: {
    bargoEscrow: "0x<BargoEscrow>",
    karmaReader:  "0x<KarmaReader>",
    rlnVerifier:  "0x<RLNVerifier>",
  },
};
```

Then update this file with the actual addresses below.

---

## V2 Deployed Addresses

| Contract     | Address                              | TxHash |
|--------------|--------------------------------------|--------|
| RLNVerifier  | <TBD — deploy via forge script>      | TBD    |
| KarmaReader  | <TBD — deploy via forge script>      | TBD    |
| BargoEscrow | <TBD — deploy via forge script>      | TBD    |

---

## ABI Deviation Notes

One deviation from PLAN §3.4:

- **`IKarmaReader.canOfferOn(address, bytes32)` → `canOffer(address, uint8)`**: The PLAN interface called `canOfferOn(who, listingId)` which required `BargoEscrow.getListing()` from within `KarmaReader`, creating a circular dependency (KarmaReader → BargoEscrow → KarmaReader). Changed to accept `requiredTier uint8` directly — BargoEscrow reads the listing's `requiredKarmaTier` and passes it. This is strictly simpler and avoids a cross-contract read. PR note: if the service-lead or frontend-lead has already hardcoded `canOfferOn(addr, listingId)` calls, they need to switch to `canOffer(addr, tier)`.

- **`settleNegotiation` removes `buyerAddress` parameter**: The PLAN §3.4 interface didn't include `buyerAddress` but the escrow needs it. Instead of adding it as a caller-supplied param (which could be spoofed), we derive it from `_offerBuyer[offerId]` set during `submitOffer`. Cleaner and tamper-proof.
