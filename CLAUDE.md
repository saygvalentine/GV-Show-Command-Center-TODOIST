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
pnpm --filter @workspace/db run push      # Push schema directly (dev only, no migration file)

# API code generation (run after editing lib/api-spec/openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Testing (requires both servers already running on port 80)
pnpm --filter @workspace/show-command-center run test              # All Playwright tests
pnpm --filter @workspace/show-command-center run test:ui           # Playwright UI mode
pnpm --filter @workspace/show-command-center run test -- --grep "test name"  # Single test by name
pnpm --filter @workspace/show-command-center run test -- tests/smoke.spec.ts # Single file
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

All routes are under `artifacts/api-server/src/routes/`: `/shows`, `/shows/:showId/tasks`, `/shows/:showId/eblasts`, `/shows/:showId/links`, `/calendar`, `/dashboard/summary`, `/dashboard/overdue`, `/office-tasks`, `/venues`, `/export`.

The `/export` route returns ICS (iCalendar) format for importing shows into calendar apps.

## Environment Variables

| Variable | Required by |
|---|---|
| `DATABASE_URL` | API server + DB migrations |
| `PORT` | Vite frontend dev server |
| `BASE_PATH` | Vite frontend base path |
| `NODE_ENV` | API server |

## Key Conventions

- **Package manager**: pnpm only — a `preinstall` script enforces this.
- **Node version**: 24; **TypeScript**: 5.9.
- **Zod imports**: Use `zod/v4` — all schemas in this repo import from `"zod/v4"`, not `"zod"`.
- **Workspace deps**: Use `workspace:*` to reference local packages.
- **DB types**: Drizzle-zod auto-generates Zod schemas from the DB schema; use these rather than writing them by hand.
- **UI components**: Radix UI primitives + custom wrappers in `artifacts/show-command-center/src/components/ui/`.
- **Routing**: wouter (not React Router).
- **Logging**: Pino with HTTP middleware on the server.

## Domain Logic

### Urgency System

Show urgency is based on days until `moveInDate` (see `getUrgencyInfo` in `artifacts/show-command-center/src/lib/date-utils.ts`):

| Days remaining | Color | Label |
|---|---|---|
| past | Gray | PAST |
| 0–3 | Red | DUE SOON |
| 4–7 | Amber | URGENT |
| 8–14 | Yellow | SOON |
| 15–30 | Green | ON TRACK |
| 31+ | Indigo | LATER |

### Show Archive Logic

A show is considered **active** if `dismantleDate ?? moveInDate >= today`; otherwise it is **archived**. There is no explicit archived flag in the DB — the dashboard route computes this dynamically.

### DB Schema Key Fields

- **shows**: `moveInDate` (required), `dismantleDate`, `advanceWarehouseDate`, `discountDeadline`, `onlineOrderDeadline`, `showStart`, `venue`, `tags` (text array).
- **tasks**: completion tracked via `completed` boolean + `completedAt` timestamp.
- **eblasts**: completion tracked via `sent` boolean + `sentAt` timestamp (not `completed`/`completedAt`).
- **office_tasks**: has `priority` (`low`/`medium`/`high`) and `status` (`todo`/`in-progress`/`done`) fields in addition to `completed`.

### Task Categories

Tasks belong to one of six hardcoded categories (each has a distinct color and a set of preset templates with calculated due dates):

- **Fire Marshal** — deadlines relative to move-in date (calendar and business days)
- **ID Sign** — deadlines relative to move-in date
- **Warehouse Manifest** — deadlines relative to `advanceWarehouseDate`
- **Show Bucket** — deadlines relative to move-in date and `onlineOrderDeadline`
- **Vehicle Spotting** — deadlines relative to move-in date
- **Electrical** — deadlines relative to `onlineOrderDeadline`

The full preset list lives in `task-list.tsx` and `eblast-list.tsx`. Each preset computes a `dueDate` and stores a human-readable `dueDateRule` string (e.g. `"30 biz days before move-in"`) as display text — it is not re-evaluated after creation.

Category badge colors come from `getCategoryColor` in `artifacts/show-command-center/src/lib/date-utils.ts`.

### Date Parsing

Always use `parseDateStr` from `lib/date-utils.ts` to convert `YYYY-MM-DD` strings to `Date` objects. Using `new Date("YYYY-MM-DD")` directly parses as UTC midnight and shifts the date backward by one day in US timezones.

On the server, `sanitizeDates` in the shows route converts empty-string date fields to `null` before writing to the DB.
