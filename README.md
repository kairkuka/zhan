# Skyvern Monorepo (Stage 1 / Block 0)

This repository contains the Stage 1 Block 0 scaffold for a TypeScript monorepo with web, api, and shared packages.

## Prerequisites
- Node.js 20+
- pnpm 9+
- Docker Desktop (or Docker Engine + Compose)

## Setup
1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Copy environment templates:
   ```bash
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```
3. Start Postgres for local development:
   ```bash
   docker compose up -d
   ```
4. Start web + api in development mode:
   ```bash
   pnpm dev
   ```

If Docker is unavailable, you can run PostgreSQL via Homebrew:
```bash
brew install postgresql@16
brew services start postgresql@16
```
To stop it later:
```bash
brew services stop postgresql@16
```

## Database (Prisma)
1. Run migrations:
   ```bash
   pnpm --filter @skyvern/api prisma:migrate
   ```
2. Seed demo data:
   ```bash
   pnpm --filter @skyvern/api prisma:seed
   ```
3. Open Prisma Studio (optional):
   ```bash
   pnpm --filter @skyvern/api prisma:studio
   ```

## Scripts
- `pnpm dev` - Runs web and api concurrently.
- `pnpm lint` - Lints all workspaces.
- `pnpm format` - Formats repository files with Prettier.
- `pnpm test` - Placeholder test command (non-failing).
- `pnpm typecheck` - Type-checks all workspaces.

## Demo Accounts
- Placeholder only for now.
- Demo users/roles will be added in later blocks.

## Folder Overview
- `apps/web` - Next.js TypeScript frontend.
- `apps/api` - Fastify TypeScript backend.
- `packages/shared` - Shared Zod schemas and TypeScript types.
- `docs` - Architecture and MVP planning docs.
- `docker-compose.yml` - Local Postgres container for development.
