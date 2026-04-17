# Haggle Contract Deployments

## Hoodi Testnet (chainId 374)

**Status:** Not yet deployed — awaiting `DEPLOYER_PRIVATE_KEY` from operator.

---

## Deploy Instructions

### Prerequisites

1. Fund deployer wallet via [Hoodi faucet](https://hoodiscan.status.network) or Status Discord.
2. Obtain `ENCLAVE_SIGNER_ADDRESS` from TEE lead (the secp256k1 address derived from the TEE's signing key).

### Step 1 — Set environment variables

```bash
export HOODI_RPC_URL=https://public.hoodi.rpc.status.network
export DEPLOYER_PRIVATE_KEY=<your-private-key>        # NEVER commit
export ENCLAVE_SIGNER_ADDRESS=<tee-signing-address>   # from TEE lead
```

### Step 2 — Deploy

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url $HOODI_RPC_URL \
  --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY
```

Expected output:
```
RLNVerifier:  0x...
KarmaReader:  0x...
HaggleEscrow: 0x...
EnclaveSignerAdded: 0x...
```

### Step 3 — Update addresses

Edit `packages/shared/src/addresses.ts`:
```ts
export const ADDRESSES = {
  374: {
    haggleEscrow: "0x<HaggleEscrow>",
    karmaReader:  "0x<KarmaReader>",
    rlnVerifier:  "0x<RLNVerifier>",
  },
};
```

Then update this file with the actual addresses below.

### Step 4 — Seed demo wallets

```bash
export KARMA_READER_ADDRESS=<KarmaReader from step 2>
export ALICE_ADDRESS=<alice-wallet>
export BOB_ADDRESS=<bob-wallet>
export EVE_ADDRESS=<eve-wallet>

forge script script/Seed.s.sol \
  --rpc-url $HOODI_RPC_URL \
  --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY
```

---

## Deployed Addresses

| Contract     | Address | TxHash |
|--------------|---------|--------|
| RLNVerifier  | TBD     | TBD    |
| KarmaReader  | TBD     | TBD    |
| HaggleEscrow | TBD     | TBD    |

---

## ABI Deviation Notes

One deviation from PLAN §3.4:

- **`IKarmaReader.canOfferOn(address, bytes32)` → `canOffer(address, uint8)`**: The PLAN interface called `canOfferOn(who, listingId)` which required `HaggleEscrow.getListing()` from within `KarmaReader`, creating a circular dependency (KarmaReader → HaggleEscrow → KarmaReader). Changed to accept `requiredTier uint8` directly — HaggleEscrow reads the listing's `requiredKarmaTier` and passes it. This is strictly simpler and avoids a cross-contract read. PR note: if the service-lead or frontend-lead has already hardcoded `canOfferOn(addr, listingId)` calls, they need to switch to `canOffer(addr, tier)`.

- **`settleNegotiation` removes `buyerAddress` parameter**: The PLAN §3.4 interface didn't include `buyerAddress` but the escrow needs it. Instead of adding it as a caller-supplied param (which could be spoofed), we derive it from `_offerBuyer[offerId]` set during `submitOffer`. Cleaner and tamper-proof.
