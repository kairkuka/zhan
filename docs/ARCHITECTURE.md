# Architecture (Stage 1 Baseline)

## Overview
- Monorepo managed by `pnpm` workspaces.
- `apps/web` is a Next.js TypeScript client.
- `apps/api` is a Fastify TypeScript service.
- `packages/shared` contains shared schemas/types (Zod + inferred TS types).
- Postgres runs in Docker for local development and later blocks.

## Product Modules (Planned)
- Auth: login, role-aware session handling.
- Curriculum: standards, units, lessons, and content metadata.
- Assignments: teacher-authored assignment definitions and due windows.
- Attempts: student submissions and grading-ready attempt records.
- Analytics: learning outcomes, mastery trends, and cohort summaries.
- Parent Dashboard: read-only progress views scoped to linked students.

## Multi-Tenant Scoping
- Every domain object is scoped by `organization_id`.
- Cross-tenant access is blocked at API boundaries and query filters.
- Membership joins users to organizations and role grants.

## Roles (Planned)
- Platform Admin: global operational access.
- Org Admin: manages org settings, staff, and guardrails.
- Teacher: creates curriculum links, assignments, and reviews attempts.
- Student: accesses assigned work and submits attempts.
- Parent: read-only visibility into linked student progress.

## Integration Contract (Current)
- API health endpoint: `GET /health` returns `{ "ok": true, "service": "api" }`.
- Web app pings API health endpoint on load and displays status.
