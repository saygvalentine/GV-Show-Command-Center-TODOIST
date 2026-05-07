# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Show Command Center** — a trade show project management tool for Exhibitor Services teams at General Service Contractors. Built as a pnpm monorepo with a React frontend, Express backend, and PostgreSQL database.

## Common Commands

```bash
# Build & typecheck
pnpm run build                  # Typecheck + build all packages
pnpm run typecheck              # Full typecheck across all packages

# Development
pnpm --filter @workspace/api-server run dev           # Start API server
pnpm --filter @workspace/show-command-center run dev  # Start frontend

# Database
pnpm --filter @workspace/db run generate  # Generate new migration
pnpm --filter @workspace/db run migrate   # Apply migrations

# API code generation (run after editing lib/api-spec/openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Testing
pnpm --filter @workspace/show-command-center run test     # Playwright tests
pnpm --filter @workspace/show-command-center run test:ui  # Playwright UI mode
```

## Architecture

### Monorepo Layout

```
artifacts/          # Deployable applications
  api-server/       # Express 5 backend
  show-command-center/  # React 19 + Vite frontend
  mockup-sandbox/   # Component preview tool

lib/                # Shared packages
  db/               # Drizzle ORM schema & migrations (PostgreSQL)
  api-spec/         # OpenAPI spec (source of truth for the API contract)
  api-client-react/ # React Query hooks generated from OpenAPI
  api-zod/          # Zod schemas generated from OpenAPI
```

### Data Flow

```
api-spec/openapi.yaml
    → (orval codegen) →
api-client-react/ (React Query hooks) + api-zod/ (Zod schemas)
    ↑ implemented by ↑
api-server/ (Express routes)
    ↓ uses ↓
db/ (Drizzle ORM + schema → drizzle-zod types)
    ↓ uses ↓
PostgreSQL 16
```

### OpenAPI-First Development

The API contract lives in `lib/api-spec/openapi.yaml`. After modifying it, run `pnpm --filter @workspace/api-spec run codegen` to regenerate:
- `lib/api-client-react/src/generated/api.ts` — React Query hooks used in the frontend
- `lib/api-zod/src/generated/` — Zod schemas for request/response validation

### Frontend Pages

| Route | Component | Purpose |
|---|---|---|
| `/` | Dashboard | Show cards, "Next Up" banner, overdue items |
| `/calendar` | Calendar | Monthly view with color-coded show chips |
| `/shows/:id` | Show Detail | Tabs: Tasks, E-Blasts, Links |
| `/office-tasks` | OfficeTasks | Office-wide task management |

### Backend Routes

All routes are under `artifacts/api-server/src/routes/`: `/shows`, `/shows/:showId/tasks`, `/shows/:showId/eblasts`, `/shows/:showId/links`, `/calendar`, `/dashboard`, `/office-tasks`, `/venues`, `/export`.

## Environment Variables

| Variable | Required by |
|---|---|
| `DATABASE_URL` | API server + DB migrations |
| `PORT` | Vite frontend dev server |
| `BASE_PATH` | Vite frontend base path |
| `NODE_ENV` | API server |

## Key Conventions

- **Package manager**: pnpm only — a `preinstall` script enforces this.
- **Workspace deps**: Use `workspace:*` to reference local packages.
- **DB types**: Drizzle-zod auto-generates Zod schemas from the DB schema; use these rather than writing them by hand.
- **UI components**: Radix UI primitives + custom wrappers in `artifacts/show-command-center/src/components/ui/`.
- **Routing**: wouter (not React Router).
- **Logging**: Pino with HTTP middleware on the server.
