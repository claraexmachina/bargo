# Deploy & Seed — Hoodi Testnet

## First-time setup (install Solidity deps)

```bash
cd contracts
# Install OpenZeppelin and forge-std
git clone --depth=1 --branch v5.3.0 \
  https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts
git clone --depth=1 \
  https://github.com/foundry-rs/forge-std.git lib/forge-std
```

Then verify:
```bash
forge build   # should compile with no errors
forge test    # should show 34/34 passing
```

## Prerequisites

```bash
export HOODI_RPC_URL=https://public.hoodi.rpc.status.network
export DEPLOYER_PRIVATE_KEY=<your-deployer-pk>        # never commit
export ENCLAVE_SIGNER_ADDRESS=<tee-secp256k1-address>  # from TEE lead
```

## 1. Deploy contracts

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url $HOODI_RPC_URL \
  --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --verify         # optional, if explorer supports
```

Outputs three addresses. Copy them into:
- `packages/shared/src/addresses.ts` under chainId 374
- `docs/deployments.md`

## 2. Seed demo wallets

```bash
export KARMA_READER_ADDRESS=<from step 1>
export ALICE_ADDRESS=<alice-wallet>
export BOB_ADDRESS=<bob-wallet>
export EVE_ADDRESS=<eve-wallet>

forge script script/Seed.s.sol \
  --rpc-url $HOODI_RPC_URL \
  --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY
```

## Tier reference

| Wallet | Tier | Throughput | Notes |
|--------|------|-----------|-------|
| Alice  | 3    | unlimited | Trusted seller for demo |
| Bob    | 1    | 10 concurrent | Regular buyer |
| Eve    | 0    | 3 concurrent | Blocked from 500k+ listings |
