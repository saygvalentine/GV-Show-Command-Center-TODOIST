# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Show Command Center (`artifacts/show-command-center`)
Trade show project management tool for Exhibitor Services teams at General Service Contractors.

**Features:**
- Dashboard with "Next Up" banner, urgency-color-coded show cards, sort controls (Date/Name/Overdue), archived shows section
- Calendar view — monthly with color-coded task/eblast chips, show filter, day detail panel
- Show Detail view — tabs for Tasks, e-Blasts, Links
- Preset task & e-blast templates with calculated due dates (calendar/business days)
- Custom tasks/e-blasts with specific or relative dates
- Dark/light mode (default dark navy)
- No authentication — open shared workspace

**Urgency System:**
- 0–3 days: Red (DUE SOON), 4–7: Amber (URGENT), 8–14: Yellow (SOON), 15–30: Green (ON TRACK), 31+: Indigo (LATER), past: Gray

**DB Schema:** shows, tasks, eblasts, links tables in `lib/db/src/schema/`

**API Routes:** /api/shows, /api/shows/:id/tasks, /api/shows/:id/eblasts, /api/shows/:id/links, /api/calendar, /api/dashboard/summary
