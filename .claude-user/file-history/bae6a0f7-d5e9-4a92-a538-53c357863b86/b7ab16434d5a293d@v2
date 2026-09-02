# Push tasks/e-blasts to Todoist

## Context

The team wants task/e-blast due dates to show up as real, checkable tasks in Todoist, not just calendar blocks. A Google Calendar push-sync already exists in this codebase (`google-calendar-client.ts` / `routes/google-calendar.ts` / `GcalProvider` / Settings page picker / sync buttons on Calendar & Show Detail pages) and is the proven architecture to mirror. Two-way sync was explicitly tabled — this is push-only (app → Todoist), same one-way, idempotent, manually-triggered model as the Calendar sync.

The Replit `todoist` connector is now authorized and has been live-verified this session:
- `POST /api/v1/tasks` (create), `POST /api/v1/tasks/{id}` (update), `POST /api/v1/tasks/{id}/close` (complete), `DELETE /api/v1/tasks/{id}` (delete) — all confirmed working via a real create→update→close→delete round trip.
- `GET /api/v1/projects` returns `{ results: [...] }` — Todoist's equivalent of "which calendar," used the same way the Gcal picker lets users choose a calendar.
- `due_date` accepts a plain `"YYYY-MM-DD"` string directly — no UTC/local date-math workaround needed here, unlike the Gcal all-day-event end-date calculation.
- Todoist rate-limits with a plain `429`, so the retry/backoff pattern already added to `gcalRequest` this session applies directly (simpler even, since Gcal needed 403-body regex sniffing and Todoist doesn't).

One deliberate improvement over the Gcal implementation: the Gcal frontend uses raw `fetch()` instead of the generated React Query hooks, inconsistent with this repo's OpenAPI-first convention. This feature will add the two new endpoints to `lib/api-spec/openapi.yaml`, codegen, and use the generated `useListTodoistProjects` / `useSyncTodoist` hooks properly in the frontend.

## Design decisions

- **Completion maps to real Todoist state**: unlike Gcal events (which have no native "done" concept, so Gcal sync fakes it with a `✓` title prefix), Todoist tasks have real open/closed state. On sync, a completed app task calls `POST /tasks/{id}/close`; an incomplete one calls `POST /tasks/{id}/reopen`. This is the actual value of a Todoist integration over Calendar, so it's the recommended default rather than just copying Gcal's prefix trick. Close/reopen calls are treated as best-effort (a failure here — e.g. already in that state — does not abort the sync of that item); this needs a quick live check during implementation to confirm Todoist no-ops cleanly on a redundant close/reopen rather than erroring.
- **No "primary" sentinel needed for projects**: Gcal resolves an unset calendar to the account's actual primary calendar ID. Todoist is simpler — omitting `project_id` on create just defaults to Inbox, so the picker can default to an empty string with no resolution step.
- **Separate project per item type**: mirrors Gcal's separate task/e-blast calendar pickers — one Todoist project for tasks, one for e-blasts, independently selectable, defaulting to Inbox.

## Backend changes

**DB schema** (`lib/db/src/schema/`):
- `tasks.ts`, `eblasts.ts`: add `todoistTaskId: text("todoist_task_id")` column, same pattern as existing `gcalEventId`.
- New `todoistOrphans.ts`, exact structural mirror of `gcalOrphans.ts`:
  ```ts
  export const todoistOrphansTable = pgTable("todoist_orphans", {
    id: serial("id").primaryKey(),
    todoistTaskId: text("todoist_task_id").notNull(),
    itemType: text("item_type").notNull().default("task"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });
  ```
- Add `export * from "./todoistOrphans";` to `lib/db/src/schema/index.ts`.
- Run `pnpm --filter @workspace/db run generate` for the migration, then `run migrate`.

**Orphan tracking on delete** — add a `todoistOrphansTable` insert parallel to the existing `gcalOrphansTable` insert, at the same three call sites, same gating logic (only if `todoistTaskId` is set):
- `routes/tasks.ts` `DELETE /:taskId` (~line 145)
- `routes/eblasts.ts` `DELETE /:eblastId` (~line 144)
- `routes/shows.ts` `DELETE /:showId` cascade (~line 218-243) — batch insert like the existing `allOrphans` array, built alongside (not merged into) the Gcal batch since it's a different table.

**New client** `artifacts/api-server/src/lib/todoist-client.ts`, mirroring `google-calendar-client.ts`:
- `todoistRequest(method, path, body)` — proxies via `connectors.proxy("todoist", path, ...)`; treat `404` as `null` (signals "recreate" to the sync logic, same as Gcal); retry on `429` with the same exponential-backoff loop just added to `gcalRequest` (500ms base, 5 attempts, jitter) — no body-sniffing needed since Todoist uses a clean `429`, not Google's `403`-with-reason.
- `todoistListProjects()` — `GET /api/v1/projects`, unwraps `.results`.
- `makeTodoistTask(content, description, dueDate, projectId)` — builds `{ content, description, due_date, project_id }`, omitting `project_id` when unset.

**New route** `artifacts/api-server/src/routes/todoist.ts`, mirroring `routes/google-calendar.ts` structure exactly:
- `GET /projects` → `todoistListProjects()`.
- `POST /sync?showId=&taskProjectId=&eblastProjectId=` → same shape as the Gcal sync route: load target show(s) + their tasks/eblasts, `syncTask`/`syncEblast` helpers that create-or-update (falling back to create if update 404s, same pattern as `syncTask` in `google-calendar.ts`), then call close/reopen based on `completed`/`sent`, batched at `CONCURRENCY = 5` like the existing loop, then `drainOrphans()` against `todoistOrphansTable` (delete each orphaned Todoist task, remove the row).
- Wire into `routes/index.ts`: `router.use("/export/todoist", todoistRouter);`

## API spec + codegen

Add to `lib/api-spec/openapi.yaml`, mirroring the existing `GcalCalendar`/`GcalSyncResult` schemas and `/export/google-calendar/*` paths exactly in shape:
- `TodoistProject { id: string, name: string }` schema; `/export/todoist/projects` GET, operationId `listTodoistProjects`.
- `TodoistSyncResult { ok, created, updated, deleted }` schema (identical shape to `GcalSyncResult`); `/export/todoist/sync` POST with `showId`/`taskProjectId`/`eblastProjectId` query params, operationId `syncTodoist`.

Run `pnpm --filter @workspace/api-spec run codegen`, which generates `useListTodoistProjects` (query hook) and `useSyncTodoist` (mutation hook, called as `mutate({ params: { showId, taskProjectId, eblastProjectId } })` — confirmed this is the exact calling convention via the existing `useSyncGoogleCalendar` generated code).

## Frontend changes

- New `artifacts/show-command-center/src/contexts/todoist-context.tsx`, mirroring `google-calendar-context.tsx`: `TodoistProvider` + `useTodoist()`, storing `taskProjectId`/`eblastProjectId` in `localStorage` (`todoist_prefs`), fetching the project list via the new `useListTodoistProjects()` hook instead of raw `fetch()`.
- New `artifacts/show-command-center/src/components/todoist-settings.tsx`, mirroring `google-calendar-settings.tsx`'s `CalendarPicker` pattern for two project pickers ("Tasks →", "e-Blasts →").
- `App.tsx`: nest `<TodoistProvider>` alongside the existing `<GcalProvider>` (both sit under `QueryClientProvider`, above `TooltipProvider`).
- `settings.tsx`: render `<TodoistSettings />` immediately after the existing `<GoogleCalendarSettings />` (~line 366).
- `calendar.tsx` and `show-detail.tsx`: add a "Push to Todoist" button next to the existing "Sync to Google Calendar" button, using `useSyncTodoist()` (proper generated-hook usage, with the same `syncing` state / toast-on-result pattern already used for the Gcal button — just via the mutation hook instead of manual `fetch`).

## Verification

1. `pnpm run typecheck` after codegen + all edits.
2. Run migration against the dev DB, confirm `todoist_task_id` columns and `todoist_orphans` table exist.
3. Start both servers, go to Settings, confirm the Todoist project pickers load real projects (Inbox + any others) via the new hook.
4. From the Calendar page, click "Push to Todoist" for one show: confirm tasks/e-blasts appear in the selected Todoist project with correct name, due date, and open/closed state matching the app.
5. Mark a task complete in the app, re-sync, confirm the Todoist task shows as checked off (close call worked); un-complete it, re-sync, confirm it reopens.
6. Delete a previously-synced task in the app, re-sync (or trigger drain), confirm the Todoist task is deleted and the `todoist_orphans` row is cleared.
7. Re-run the sync a second time with no changes — confirm counts show mostly `updated`, not `created` (idempotency, no duplicates).
