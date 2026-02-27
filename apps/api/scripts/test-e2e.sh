#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="../../.env.test"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy ../../.env.test.example to ../../.env.test and set test variables."
  exit 1
fi

db_url=$(pnpm --filter @skyvern/api exec dotenv -e "$ENV_FILE" -- node -e 'process.stdout.write(process.env.DATABASE_URL ?? "")')
if [[ -z "$db_url" ]]; then
  echo "DATABASE_URL is missing in $ENV_FILE"
  exit 1
fi

if [[ "$db_url" != *test* ]]; then
  echo "Refusing to run e2e on non-test DATABASE_URL: $db_url"
  exit 1
fi

pnpm --filter @skyvern/api exec dotenv -e "$ENV_FILE" -- prisma migrate reset --force --skip-generate --skip-seed --schema prisma/schema.prisma
pnpm --filter @skyvern/api exec dotenv -e "$ENV_FILE" -- tsx prisma/seed.ts
pnpm --filter @skyvern/api exec dotenv -e "$ENV_FILE" -- tsx --test tests/e2e/**/*.test.ts
