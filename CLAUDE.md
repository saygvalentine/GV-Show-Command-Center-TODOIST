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
pnpm --filter @workspace/api-server run dev           # Build (esbuild) then start API server (no watch; restart to pick up changes)
pnpm --filter @workspace/show-command-center run dev  # Start frontend (Vite HMR)

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

The API server runs DB migrations automatically on startup (via `drizzle-orm/node-postgres/migrator`), but only if the `shows` table does not yet exist — otherwise it skips to avoid re-applying already-applied migrations.

## Todoist sync status and guardrails

### Current implementation status

- Phase 1 foundation is in place:
  - `todoist_settings` stores the Task and E-Blast Todoist project IDs server-side.
  - `todoist_sync_events` is the durable outbound outbox schema.
  - `todoist_webhook_events` is the future inbound webhook audit/deduplication schema.
- The application currently still uses the legacy manual one-way Todoist flow:
  - Existing `POST /api/export/todoist/sync` remains active.
  - Existing "Push to Todoist" UI remains active.
  - `tasks.ts` and `eblasts.ts` do not yet enqueue or deliver automatic Todoist events.
  - No Todoist webhook receiver exists yet.
- Do not describe the Phase 1 tables as active automatic synchronization until later phases are implemented.

### Settings

- Todoist project configuration must be read from and written to server-side `todoist_settings`.
- Do not add or restore `localStorage["todoist_prefs"]` as a Todoist sync configuration source.
- This app currently has no user/auth/workspace model, so `todoist_settings` is a singleton keyed by `id = "default"`.

### Outbound sync design

- `todoist_sync_events` is the future durable outbox for task and e-blast changes.
- Use a coalesced current-state model: one active event per item, not a replay of every intermediate edit.
- Delivery shapes are `upsert` and `delete`; `reason` records why the event was created.
- Active means `pending` or `in_progress`. Historical `delivered`, `failed`, and `abandoned` rows must not block future events.
- Never introduce a resident `setInterval` retry loop. This project uses Replit autoscale deployment and can scale to zero between requests.
- Future retries must be triggered by active requests, webhook requests, explicit repair actions, or a deliberately low-frequency scheduled HTTP trigger.

### Deletion and remote identity

- Use `tasks.todoistTaskId` and `eblasts.todoistTaskId` as the only local-to-Todoist identity mappings.
- Never match Todoist tasks by title/content.
- Local deletion will eventually enqueue a retryable remote delete.
- A future Todoist-side deletion must preserve the local task/e-blast record, clear `todoistTaskId`, and log the event as an explicit unlink — never delete the local record and never silently recreate the Todoist task on the next ordinary local edit. Relinking must be an explicit future Sync Health/Repair action, not an implicit side effect of normal outbox delivery.

### Production migration requirement

- Migrations do **not** auto-apply to an already-running deployment: startup only calls the migrator when the `shows` table does not yet exist, so any migration added after initial launch (including `todoist_settings`/`todoist_sync_events`/`todoist_webhook_events`) must be applied manually against the production `DATABASE_URL` via `pnpm --filter @workspace/db run migrate`, then followed by a redeploy/restart to pick up any dependent route changes.

### Key-task name-coupling risk (pre-existing, unrelated to Todoist sync)

- `routes/dashboard.ts`, `routes/shows.ts`, and `task-list.tsx`'s `KEY_TASKS`/`isKeyTask()` identify business-critical tasks (e.g. "Submit To FM/EC", "Submit ID Sign Order", "Bucket Due Date") by exact `{name, category}` string equality, not by a stable id — there is no `presetTaskId` linking a task back to its preset.
- This has already broken production once: `index.ts` contains one-off `UPDATE` statements backfilling renamed task/preset names because key-task detection silently desynced after a label was renamed.
- Any Todoist sync work must resolve local↔remote items only through `todoistTaskId`/local `id`, never through Todoist's `content` string, to avoid reintroducing this same failure mode from the other direction.

## Environment Variables

| Variable | Required by |
|---|---|
| `DATABASE_URL` | API server + DB migrations |
| `PORT` | API server + Vite frontend dev server |
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
| 0–7 | Red | URGENT |
| 8–13 | Amber | CLOSE |
| 14–30 | Yellow | SOON |
| 31–60 | Green | IN PROGRESS |
| 61+ | Indigo | PLANNING |

### Show Archive Logic

A show is considered **active** if `dismantleDate ?? moveInDate >= today`; otherwise it is **archived**. There is no explicit archived flag in the DB — the dashboard route computes this dynamically.

### DB Schema Key Fields

- **shows**: `moveInDate` (required), `dismantleDate`, `advanceWarehouseDate`, `discountDeadline`, `onlineOrderDeadline`, `showStart`, `venue`, `tags` (text array).
- **tasks**: completion tracked via `completed` boolean + `completedAt` timestamp; has `category`, `dueDate`, `dueDateRule`, `notes`.
- **eblasts**: completion tracked via `sent` boolean + `sentAt` timestamp (not `completed`/`completedAt`); no category field.
- **office_tasks**: has `priority` (`low`/`medium`/`high`) and `status` (`todo`/`in-progress`/`done`) fields in addition to `completed`; standalone (no `showId`).
- **links**: `title` + `url` only; no completion state.
- **venues**: lookup table referenced by `shows.venue` (text, not a foreign key).

### Task Categories

Tasks belong to one of six hardcoded categories (each has a distinct color and a set of preset templates with calculated due dates):

- **Fire Marshal** — deadlines relative to move-in date (calendar and business days)
- **ID Sign** — deadlines relative to move-in date
- **Warehouse Manifest** — deadlines relative to `advanceWarehouseDate`
- **Show Bucket** — deadlines relative to move-in date and `onlineOrderDeadline`
- **Vehicle Spotting** — deadlines relative to move-in date
- **Electrical** — deadlines relative to `onlineOrderDeadline`

The full preset list lives in `artifacts/show-command-center/src/components/task-list.tsx` and `eblast-list.tsx` (same directory). Each preset computes a `dueDate` and stores a human-readable `dueDateRule` string (e.g. `"30 biz days before move-in"`) as display text — it is not re-evaluated after creation.

Category badge colors come from `getCategoryColor` in `artifacts/show-command-center/src/lib/date-utils.ts`.

### Date Parsing

Always use `parseDateStr` from `lib/date-utils.ts` to convert `YYYY-MM-DD` strings to `Date` objects. Using `new Date("YYYY-MM-DD")` directly parses as UTC midnight and shifts the date backward by one day in US timezones.

On the server, `sanitizeDates` in the shows route converts empty-string date fields to `null` before writing to the DB.
