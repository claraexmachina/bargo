FROM node:20-slim AS base

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests first so Docker caches pnpm install across source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/crypto/package.json packages/crypto/
COPY apps/negotiation-service/package.json apps/negotiation-service/

RUN pnpm install --frozen-lockfile --filter @bargo/negotiation-service...

# Source
COPY packages/shared/ packages/shared/
COPY packages/crypto/ packages/crypto/
COPY apps/negotiation-service/ apps/negotiation-service/

# Writable data directory (attestation bundles + SQLite)
RUN mkdir -p /app/apps/negotiation-service/data/attestations

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

WORKDIR /app/apps/negotiation-service
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
