# Haggle

> TEE-mediated P2P negotiation — agents negotiate price and meetup conditions so you don't have to.

**Status: WIP (hackathon)**

- [PRD](./PRD.md) — problem statement, user stories, demo scenario
- [PLAN](./PLAN.md) — architecture, shared types, file ownership, phase gates

## Setup

```bash
# Prerequisites: pnpm 9, Node 20+, Foundry, Python 3.12
pnpm install
cp .env.example .env.local   # fill in your values
```

### Per-package dev commands

| Package / App | Command |
|---|---|
| `packages/shared` | `pnpm -C packages/shared typecheck` |
| `packages/crypto` | `pnpm -C packages/crypto test` |
| `apps/web` | `pnpm -C apps/web dev` |
| `apps/negotiation-service` | `pnpm -C apps/negotiation-service dev` |
| `contracts` | `cd contracts && forge test` |
| `services/tee` | `cd services/tee && uv run uvicorn haggle_tee.server:app --reload` |

### Run all checks

```bash
pnpm lint        # Biome
pnpm typecheck   # tsc --noEmit across all TS packages
pnpm test        # vitest + pytest (see CI for forge)
```

## Deployments

See [docs/deployments.md](./docs/deployments.md) for contract addresses on Hoodi (chain ID 374).

## Environment variables

See [docs/env-reference.md](./docs/env-reference.md) and [.env.example](./.env.example).
