# Two-Way Todoist Sync — Revised Implementation Plan

Repository: `saygvalentine/GV-Show-Command-Center-TODOIST` · Branch: `expand-completed-tasks-default` (currently identical to `main` — `git diff main...origin/expand-completed-tasks-default` is empty, so everything below is grounded in the checked-out `main` tree). **Read-only discovery pass — nothing has been edited, migrated, branched, or committed.**

---

## 1. Current-state findings

### Database (`lib/db/src/schema/`)

- **`tasks.ts`**: `id, showId(FK→shows.id, cascade), name, category, dueDate, dueDateRule, completed, completedAt, notes, gcalEventId, todoistTaskId, createdAt`. No `presetTaskId` — nothing relationally links a task to the preset it was created from.
- **`eblasts.ts`**: same shape with `sent`/`sentAt` instead of `completed`/`completedAt`, no `category`.
- **`presetTasks.ts`**: pure template table (`name, category, dueDateOffset/Unit/Direction/Anchor`) — copied by value into a task at creation time, never referenced again (confirms CLAUDE.md's "not re-evaluated after creation").
- **`todoistOrphans.ts`**: `id, todoistTaskId(notNull), itemType(default "task"), createdAt` — a bare delete-intent queue, no status/attempt/retry columns, drained only inline inside the manual `/export/todoist/sync` route.
- **`gcalOrphans.ts`**: identical pattern for Google Calendar (`calendarType` instead of `itemType`) — a parallel, independently-implemented mechanism, not shared code.
- **No users/auth/session/workspace/tenant tables anywhere.** `schema/index.ts` exports exactly: `shows, tasks, eblasts, links, officeTasks, venues, presetTasks, gcalOrphans, todoistOrphans`. Grepped for `user|auth|session|workspace|tenant` across schema + `api-server/src/middlewares/` and for `passport|jwt|req.user|isAuthenticated` across the whole api-server: zero hits. This is confirmed single-tenant — there is no ownership scope to hang settings off of, which matters for the settings-table design below.
- **Migration mechanics**: sequential SQL files in `lib/db/migrations/` (`0000`–`0007`), generated via `pnpm --filter @workspace/db run generate`. Startup (`index.ts`) only calls `migrate()` if the `shows` table does **not** yet exist — since this app is already running, `runMigrations()` on production **never runs the migrator again**. Confirmed by CLAUDE.md and by the code. **This means new migrations must be applied manually** (`pnpm --filter @workspace/db run migrate` against the real `DATABASE_URL`) as an explicit rollout step — deploying alone will not apply them.

### Todoist backend (`artifacts/api-server/src/`)

- **`lib/todoist-client.ts`**: `todoistRequest(method, path, body)` proxies through `ReplitConnectors().proxy("todoist", path, ...)` — 404→`null`, 429→retry up to 5× with exponential backoff+jitter, other non-2xx→throw, 204→`{}`. Plus `todoistListProjects()` and `makeTodoistTask(content, description, dueDate, projectId?)` (hardcodes `due_string: "${dueDate} 09:00"`). **This module is fine as-is and stays the single choke point for all outbound Todoist HTTP.**
- **`routes/todoist.ts`**: `setTodoistCompletion()` → `POST /tasks/:id/close|reopen`. `syncTask`/`syncEblast`: if no `dueDate`, delete the Todoist task + clear `todoistTaskId` inline; else build content/description, `POST` update to the existing id (404 on update → treated as "recreate", i.e. the id is nulled and a fresh task is created), or create if none stored, then push completion state. `drainOrphans()` reads all `todoist_orphans` rows, deletes each remote task at concurrency 5, deletes the row — **a thrown error mid-batch aborts the whole `Promise.all` and leaves remaining rows in place**; this "works" today only because it's a manual, re-clickable action, not because it was built with retry semantics.
- Mounted at `/api/export/todoist/{projects,sync}` (via `app.ts`'s `app.use("/api", router)` and `routes/index.ts`'s `router.use("/export/todoist", todoistRouter)`).
- **No webhook receiver, no cron, no scheduled job anywhere** in the api-server — confirmed by grep.
- **`index.ts` bootstrap**: `app.listen()` first (so Replit's health probe passes before the DB connects), then conditional `migrate()` + preset-task reseed + a few legacy-name `UPDATE` statements (see Key-task coupling below).
- **`.replit`: `deploymentTarget = "autoscale"`.** This is the single most important infrastructure fact for this rewrite: an autoscale deployment is **not guaranteed to be running between requests** — it scales to zero on idle and cold-starts on the next inbound HTTP hit. This directly validates your architecture amendment: an in-process `setInterval` retry loop isn't just wasteful here, it's **unreliable** — Replit can suspend the process between ticks, so nothing timer-based can be trusted to fire. Any retry/reconciliation trigger has to be a real inbound HTTP request (a user mutation, a Todoist webhook delivery, an explicit repair call, or a genuine Replit Scheduled Deployment hitting an endpoint).
- `.replit`'s `[agent] integrations` list currently only names `"google-calendar:1.0.0"` — **no `todoist` entry**, despite `todoist-client.ts` already calling the `"todoist"` connector in production. Likely just agent-scaffolding metadata rather than the authoritative connector registry (since the existing sync evidently works), but inconsistent enough to verify rather than assume — see External Setup Checklist.

### Frontend

- **`contexts/todoist-context.tsx`**: `TodoistProvider` holds `{taskProjectId, eblastProjectId}` in React state, hydrated from / persisted to `localStorage["todoist_prefs"]`; fetches `projects` via `useListTodoistProjects()`.
- **`components/todoist-settings.tsx`**: two `<Select>` pickers ("Tasks →", "e-Blasts →") bound directly to the context — purely presentational.
- **`pages/show-detail.tsx`** (~L49-51, 268-271) and **`pages/calendar.tsx`** (~L45-47, 260-265): both call `useSyncTodoist()` and render an outline "Push to Todoist" button.
- **Codegen workflow**: `lib/api-spec/openapi.yaml` is the source of truth → `pnpm --filter @workspace/api-spec run codegen` regenerates `lib/api-client-react/src/generated/api.ts` (hooks) and `lib/api-zod/src/generated/` (Zod schemas). Today it defines exactly `/export/todoist/projects` (GET) and `/export/todoist/sync` (POST) plus `TodoistProject`/`TodoistSyncResult` schemas — no settings endpoints, nothing webhook-related (webhooks don't need an OpenAPI entry for the app's own client, but the new settings CRUD does).

### Route handlers (`routes/tasks.ts`, `routes/eblasts.ts`)

Read in full. Relevant to this rewrite:
- `PUT /:taskId` / `PUT /:eblastId` accept a full-body update (`UpdateTaskBody`/`UpdateEblastBody` from `@workspace/api-zod`); completion logic is inline (`completed:true` → `completedAt = provided ?? new Date()`; `completed:false` → `completedAt = null`).
- `DELETE` handlers currently: `SELECT` the row's `gcalEventId`/`todoistTaskId`, insert orphan rows into `gcalOrphansTable`/`todoistOrphansTable` if present, **then** delete the row. This delete-then-queue pattern is exactly the shape the new outbox needs to generalize to create/update/complete/reopen too, not just delete.
- Neither `POST` (create) nor `PUT` (update) currently touch Todoist at all — that's the entire gap Phase 2 fills.

### Key-task name coupling (real, already-triggered fragility — not hypothetical)

Grepped for the three key-task strings across the repo. Exact `{name, category}` string matching drives business logic in:
- `routes/dashboard.ts` L21-25 (overdue enrichment: "Hard Deadline"/Fire Marshal, "ID Sign Deadline" falling back to "Submit ID Sign Order"/ID Sign, "Bucket Due Date"/Show Bucket) and L157/170 (`/summary`'s Next-Up card: "Submit To FM/EC", "Submit ID Sign Order").
- `routes/shows.ts` L67, 81, 97-98 — same three key names.
- `components/task-list.tsx` L407-414 — `KEY_TASKS`/`isKeyTask()`, the same three `{category, name}` pairs, consumed by `task-list.tsx` itself, `dashboard-task-slider.tsx` (blocks deleting key tasks), and `pages/settings.tsx` (flags key presets in the editor).
- **This already broke once in production**: `index.ts` L86-101 contains one-off `UPDATE` statements renaming both `preset_tasks.name` and any live `tasks.name` from old strings ("Check In / Submit", "Submit Order") to today's key-task strings, with comments stating this was needed because "key-task detection in shows/dashboard routes expects" the new name. Someone renamed a label and it silently desynced business logic until this backfill shipped.
- There is **no relational link** (`presetTaskId`) between `tasksTable` and `presetTasksTable` — the only connection is that `name`+`category` happened to match at creation time.
- **Implication for this rewrite**: your confirmed scope (rule #3 — no inbound title/category from Todoist in Phase 1) already avoids reintroducing this exact failure mode. The one guardrail worth stating explicitly in code review: local↔remote item resolution must always go through `todoistTaskId` / local `id`, never through matching on Todoist's `content` string.

---

## 2. Decisions confirmed → implementation implication

| # | Rule | Implication |
|---|---|---|
| 1 | Tasks + e-blasts only; office tasks stay app-only | No schema/route changes to `officeTasks.ts`/`routes/officeTasks.ts` in this project. |
| 2 | App is source of truth; Todoist is an execution surface; reuse existing `todoistTaskId` | No new task/eblast identity columns needed — `todoistTaskId` is already the mapping key everywhere. |
| 3 | Local→Todoist: create/complete/reopen/delete/unlink + title/description/due-date. Todoist→local: completion/reopen/deletion only, in Phase 1 | Outbound stays a full-state push (as today); inbound webhook handler only ever writes `completed`/`completedAt` (or `sent`/`sentAt`) or unlinks — never `name`/`category`/`dueDate`/`notes`. |
| 4 | No-due-date rule preserved; identify current behavior + recommend final rule | Current: `syncTask`/`syncEblast` delete the Todoist task and null `todoistTaskId` the moment `dueDate` is cleared (`routes/todoist.ts` L20-27, 69-76). **Recommend keeping this exactly** — it's already the safest option (no due date ⇒ no Todoist representation ⇒ nothing to reconcile), just move it from the manual-sync code path into the new outbound outbox path unchanged. |
| 5 | Remote deletion → unlink only, preserve local row, audit it, no silent recreate on next *automatic* touch beyond normal upsert | See Risk #2 below — unlink-then-recreate-on-next-edit is the natural outbox behavior; flagging the exact edge case for your sign-off rather than assuming. |
| 6 | Local deletion → enqueue retryable/idempotent remote delete | Generalizes today's `DELETE` handlers' orphan-insert into an outbox `operation='delete'` row (see Schema). |
| 7 | Settings move server-side; keep the two-picker UI; check ownership scope before assuming singleton | Checked — confirmed no auth/workspace model exists (see Findings). Singleton is correct, but keyed so it isn't awkward to extend later (see Schema). |
| 8 | Key-task safety — identify title-matching risk, recommend a stable identifier, don't let Todoist content become a business-logic key | Identified above (`dashboard.ts`, `shows.ts`, `task-list.tsx`). Not touched by Phase 1 (inbound title sync is explicitly excluded), but flagged as a separate pre-existing risk with a concrete follow-up (`presetTaskId`) — see Schema + Risks. |

---

## 3. Recommended target architecture

**Local mutation flow** (`tasks.ts`/`eblasts.ts` POST/PUT/DELETE): in one DB transaction, write the task/eblast change **and** upsert an outbox row for that item (coalescing with any existing pending row for the same item — see idempotency below). After the transaction commits, attempt delivery to Todoist synchronously, in the same request, with a short timeout — this satisfies "attempt delivery immediately as part of an already-active request." On success, mark the outbox row `delivered` and (for create) store the returned `todoistTaskId`. On failure, catch it, record `lastError`, leave the row `pending` with a backoff-computed `nextAttemptAt` — **the user's HTTP response is never blocked or failed by a Todoist-side error.**

**Durable outbound outbox** (`todoist_sync_events`): the atomic record of intent described above. No persistent worker drains it. It's drained only by:
1. Inline, immediately, inside the request that created it (the common case).
2. Opportunistically by *any other* inbound HTTP request that touches the same item, or (small batch, e.g. up to 5) by an inbound Todoist webhook request piggybacking a drain of the oldest due rows before it responds — "don't create regular activity merely to ask whether work exists," so this only fires when a request is already happening for another reason.
3. An explicit internal "Sync now"/repair call (Phase 4).
4. Only if (1)–(3) prove insufficient: a Replit **Scheduled Deployment** (itself scale-to-zero-compatible — a cron trigger that hits a URL, not a resident process) calling a dedicated low-frequency reconcile endpoint. Deferred to Phase 4 as a "decide with real data" item, not built speculatively now.

**Claim/lock**: a conditional `UPDATE ... SET status='in_progress', claimed_at=now() WHERE id=$1 AND status='pending' AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes') RETURNING *` — Postgres row-level atomicity is sufficient at this traffic/concurrency level; the 2-minute staleness window reclaims a row whose worker crashed mid-delivery. No separate lock table needed.

**Idempotency / coalescing**: rather than modeling `create`/`update`/`complete`/`reopen` as four separate queued diffs that must be sequenced correctly, recommend **one active outbox row per item** that always carries the item's *current* full state at delivery time (an "upsert" shape — matching what `syncTask`/`syncEblast` already do today: one function call both creates-or-updates content *and* sets completion). A partial unique index `(item_type, item_id) WHERE status IN ('pending','in_progress')` enforces "at most one active event per item"; a second rapid edit updates that same pending row's snapshot instead of inserting a duplicate. The specific triggering `reason` (`create`/`update`/`complete`/`reopen`/`delete`/`unlink`) is still recorded for audit, decoupled from the two actual delivery shapes (`upsert`/`delete`) — see Risk #3, flagged for your approval since it's a deliberate deviation from a literal reading of "operations including create, update, complete, reopen, delete, unlink."

**Failure/retry**: exponential backoff into `nextAttemptAt` (e.g. 2min → cap ~1hr, matching the cost-conscious brief), `attemptCount` incremented per failure, `status` flips to `failed` after N attempts (surfaced in Sync Health for manual retry) — never silently dropped; `abandoned` is only ever set by an explicit repair action.

**Inbound webhook flow** (`POST /api/webhooks/todoist`):
1. Verify `X-Todoist-Hmac-SHA256` against `TODOIST_CLIENT_SECRET` using the **raw** request body bytes. **Concrete implementation risk**: `app.ts` currently calls `app.use(express.json())` globally before mounting `/api`; HMAC verification needs the exact raw bytes Todoist signed, so the webhook route needs raw-body capture (`express.json({ verify: (req,res,buf) => { req.rawBody = buf } })` applied globally, or a route-specific `express.raw()` ahead of the global parser for this one path) — flagged now so it isn't discovered mid-Phase-3.
2. On signature mismatch → `401`, stop.
3. Compute a dedupe key (prefer a stable provider event id if the payload includes one — **unconfirmed from repo alone, needs checking against Todoist's current webhook payload shape during implementation**; else a deterministic fingerprint of `event_name + event_data.id + timestamp`). `INSERT ... ON CONFLICT DO NOTHING` into `todoist_webhook_events`; 0 rows inserted ⇒ duplicate delivery ⇒ ack `200` immediately without reprocessing. This is explicit dedup-by-storage, not "the resulting state happens to already be correct."
4. If inserted: look up local `tasks` then `eblasts` by `todoistTaskId`. Not found → mark `unmatched`, still `200`. Found → apply directly via `db.update(...)` on the task/eblast row (bypassing the normal route-handler outbound-enqueue hook entirely, since that hook lives in the `tasks.ts`/`eblasts.ts` HTTP handlers, not a shared DB-level trigger) — this is what prevents the requested outbound-echo problem: the webhook path never re-enqueues an outbox row for the change it just applied.
5. Mark the webhook event `processed`.

**Reconciliation/repair**: an internal endpoint that re-derives/re-enqueues outbox rows for stale or `failed` items, and a minimal Sync Health view — reuses the same delivery function as normal drains, just triggered manually/rarely.

**Replit cost implications**: no standing compute between requests; each webhook delivery does one fast `INSERT ... ON CONFLICT` for dedup, a small lookup+update, and an optional small opportunistic drain — bounded, request-scoped work, nothing that keeps the instance warm on its own.

---

## 4. Schema proposal

### `todoist_settings` (replaces `todoist_prefs` localStorage)
```
id            text primary key default 'default'   -- not serial/int(1): keeps the table
                                                     -- extensible later without renumbering,
                                                     -- even though today it's genuinely a singleton
taskProjectId   text
eblastProjectId text
updatedAt       timestamp tz not null default now()
```

### `todoist_sync_events` (outbound outbox — see migration path below for how `todoist_orphans` feeds into this)
```
id                serial primary key
itemType          text not null              -- 'task' | 'eblast'
itemId            integer                    -- nullable: null for delete-rows sourced
                                               -- from an already-gone local row
todoistTaskId     text                       -- nullable: populated once known; required
                                               -- for delete rows where itemId is null
operation         text not null              -- 'upsert' | 'delete'  (delivery shape)
reason            text not null              -- 'create'|'update'|'complete'|'reopen'
                                               -- |'delete'|'unlink'  (audit-only)
status            text not null default 'pending'  -- pending|in_progress|delivered|failed|abandoned
attemptCount      integer not null default 0
nextAttemptAt     timestamp tz not null default now()
claimedAt         timestamp tz
payloadSnapshot   jsonb                      -- item fields at enqueue time, audit trail
lastError         text
createdAt         timestamp tz not null default now()
updatedAt         timestamp tz not null default now()

-- indexes
CREATE INDEX ON todoist_sync_events (status, next_attempt_at);
CREATE UNIQUE INDEX ON todoist_sync_events (item_type, item_id)
  WHERE status IN ('pending', 'in_progress');   -- coalescing / idempotency
```

### `todoist_webhook_events` (inbound audit + dedup log)
```
id               serial primary key
providerEventId  text            -- nullable; populate if Todoist's payload has a stable id (confirm during impl)
fingerprint      text not null   -- deterministic fallback dedupe key, always computed
eventType        text not null   -- 'item:completed' | 'item:uncompleted' | 'item:deleted' | ...
todoistTaskId    text not null
payload          jsonb not null  -- full raw payload, for debugging the real shape
receivedAt       timestamp tz not null default now()
status           text not null default 'received'  -- received|processed|unmatched|error
processedAt      timestamp tz
error            text

CREATE UNIQUE INDEX ON todoist_webhook_events (fingerprint);
CREATE UNIQUE INDEX ON todoist_webhook_events (provider_event_id) WHERE provider_event_id IS NOT NULL;
```

### `todoist_orphans` disposition — **recommend Option B: migrate into `todoist_sync_events`**, not (A) leave temporarily or (C) drop outright.

Rationale: it's already structurally a proto-outbox (one delete-intent row per item), just missing status/attempt/retry columns. Generalizing it in place avoids running two parallel outbound-delivery data models side by side during the transition — which is exactly the duplicate-mechanism risk this rewrite should remove, not add.

Migration path:
1. New migration creates `todoist_sync_events`/`todoist_webhook_events`/`todoist_settings`.
2. Data-migration step: copy every `todoist_orphans` row into `todoist_sync_events` as `operation='delete', reason='delete', status='pending', itemId=null, todoistTaskId=<copied>`.
3. `routes/tasks.ts`/`routes/eblasts.ts` stop inserting into `todoistOrphansTable` on `DELETE`, and instead enqueue a `todoist_sync_events` delete row directly (same data they capture today).
4. Once nothing in the codebase references `todoistOrphansTable`, drop it in a **later, separate** migration (Phase 5) — keep it one release behind the cutover so a rollback doesn't strand in-flight orphan rows.

### Task/e-blast schema changes beyond the existing `todoistTaskId`: **none required for Phase 1.** All the data the outbox needs (`name`, `category`, `dueDate`, `notes`, `completed`/`sent`) already exists on the rows; the outbox changes *when/how reliably* it's sent, not *what* is sent.

### Stable key-task identity
No schema change required for Todoist sync itself (Phase 1 never lets Todoist content flow into `name`/`category`). Recommend a **separate follow-up ticket**, out of scope here: add `presetTaskId integer references preset_tasks(id)` (nullable) to `tasksTable`, and switch `dashboard.ts`/`shows.ts`/`task-list.tsx`'s `KEY_TASKS` matching from `{name, category}` string equality to `presetTaskId` equality. Surfacing it because your rule #8 asked for it, not because this project needs to fix it to be safe.

---

## 5. File-by-file implementation map

**New files**
- `lib/db/src/schema/todoistSettings.ts`
- `lib/db/src/schema/todoistSyncEvents.ts`
- `lib/db/src/schema/todoistWebhookEvents.ts`
- `lib/db/migrations/000X_todoist_outbox.sql` (+ the orphans→sync_events data migration)
- `artifacts/api-server/src/lib/todoist-outbox.ts` — `enqueue()`, `claimBatch()`, `markDelivered()`, `markFailed()`
- `artifacts/api-server/src/lib/todoist-webhook-verify.ts` — HMAC verification helper
- `artifacts/api-server/src/routes/todoist-webhook.ts` — `POST /webhooks/todoist`
- `artifacts/api-server/src/routes/todoist-settings.ts` (or folded into `routes/todoist.ts`) — settings GET/PUT
- *(Phase 4)* `artifacts/api-server/src/routes/todoist-internal.ts` — reconcile + Sync Health read endpoints
- *(Phase 4, optional)* a Sync Health section in `pages/settings.tsx` or its own page

**Existing files to modify**
- `lib/db/src/schema/index.ts` — export the new modules
- `artifacts/api-server/src/app.ts` — raw-body capture for the webhook path
- `artifacts/api-server/src/routes/index.ts` — mount new routers
- `artifacts/api-server/src/routes/tasks.ts` — POST/PUT/DELETE enqueue + attempt-deliver (transactional write + post-commit delivery attempt)
- `artifacts/api-server/src/routes/eblasts.ts` — same
- `artifacts/api-server/src/routes/todoist.ts` — keep `GET /projects`; fold `syncTask`/`syncEblast` into the shared delivery function used by both route handlers and the internal reconcile job; retire `drainOrphans` in favor of outbox draining
- `lib/api-spec/openapi.yaml` — add settings GET/PUT; stop treating `syncTodoist` as a public user action once Phase 5 lands
- `contexts/todoist-context.tsx` — swap localStorage for the new settings hooks
- `components/todoist-settings.tsx` — no structural change, just its data source
- `pages/show-detail.tsx`, `pages/calendar.tsx` — remove the Push-to-Todoist button/handler (Phase 5)

**Files/UI removed or deprecated**
- "Push to Todoist" buttons (Phase 5)
- `todoist_orphans` table (dropped in a later migration, after the cutover is proven — Phase 5)
- `todoist_prefs` localStorage key (goes dead once the context is rewired; no explicit cleanup code needed)

Recommended order of work = the Phased Delivery Plan below.

---

## 6. External setup checklist

- Register a Todoist Developer App to get webhook-capable client id/secret (webhooks need a full App registration — **cannot confirm from repo code alone whether this is the same app the Replit connector already uses, or a separate one**; treat as a spike, not an assumption, at the start of Phase 3).
- New secret: `TODOIST_CLIENT_SECRET` (HMAC verification) — store via Replit's Secrets, consistent with how the connector itself needs no repo-level key today.
- Register the webhook callback URL = api-server's public deployment URL + `/api/webhooks/todoist`, subscribed to `item:completed`, `item:uncompleted`, `item:deleted`.
- Confirm whether `.replit`'s `[agent] integrations` list needs a `todoist` entry added (it currently only lists `google-calendar:1.0.0`) for Replit's tooling to consider the connector/app "configured," or whether that list is cosmetic scaffolding metadata.
- Confirm Todoist's actual current webhook payload shape (event id field name, presence of `completed_at`) against their live docs during implementation — the schema above is built to tolerate its absence (fingerprint fallback) but should be tightened once confirmed.

---

## 7. Phased delivery plan

**Phase 0 — Design/schema review only.** This document; no code. *Acceptance*: you approve the schema + architecture. *Rollback*: n/a.

**Phase 1 — Schema + server-side settings.** Add `todoist_settings`, `todoist_sync_events`, `todoist_webhook_events` (created but unused by any route yet — lowest-risk slice). Rewire `todoist-context.tsx`/`todoist-settings.tsx` to the new settings endpoints. *Acceptance*: migrations apply cleanly against a copy of the real DB; Settings page's project pickers persist through Postgres instead of localStorage (verified by clearing browser storage); existing manual "Push to Todoist" button still works unchanged. *Rollback*: drop the new tables, revert settings routing to localStorage — nothing existing was modified.

**Phase 2 — Outbound automatic sync.** `tasks.ts`/`eblasts.ts` enqueue+attempt-deliver on create/update/delete; `todoist.ts`'s sync logic becomes the shared delivery function. *Acceptance*: creating/completing/reopening/deleting a task or e-blast in the app updates Todoist within the same request against a real Todoist project; a simulated Todoist outage leaves a `pending` outbox row instead of losing the change or failing the user's save. *Rollback*: revert the route-handler hooks; existing `todoistTaskId` links and Todoist tasks are unaffected since this phase is additive.

**Phase 3 — Webhook inbound completion lifecycle.** `todoist-webhook.ts` + verification + dedup + apply-to-local-row; raw-body handling in `app.ts`; the Developer App/webhook-registration spike happens here. *Acceptance*: checking off / reopening / deleting a linked task in Todoist updates the app within one webhook round-trip, verified live; replaying an identical payload twice yields one `processed` row and one deduped no-op in `todoist_webhook_events`. *Rollback*: disable the webhook in Todoist's console (or have the route ack-without-processing) — outbound sync from Phase 2 is unaffected.

**Phase 4 — Backfill/reconciliation/Sync Health.** Internal reconcile endpoint; minimal Sync Health view (pending/failed counts, unmatched events, manual retry). Decide the Scheduled-Deployment fallback here, with real data, not speculatively. *Acceptance*: intentionally starve an item, confirm it surfaces as `failed` with a working manual retry. *Rollback*: additive/read-mostly, safe to ship dark.

**Phase 5 — Remove manual sync UI and legacy behavior.** Delete the Push-to-Todoist buttons; stop exposing `POST /export/todoist/sync` as a public operation; drop `todoist_orphans` once confident no in-flight rows remain from before Phase 2. *Acceptance*: full regression pass on task/e-blast CRUD + two-way completion with no manual sync button anywhere. *Rollback*: UI/cleanup only by design — the orphans-table drop is the one non-reversible step, which is why it's sequenced last and separate from the route/UI removal.

---

## 8. Risks and decisions requiring owner approval

1. **Replit connector vs. separate Todoist Developer App for webhooks** — unresolvable from code; needs a live spike before Phase 3 begins. *Recommendation*: timebox a half-day spike first.
2. **Auto-recreation after a remote-delete unlink** — your rule #5 says unlink-only, preserve the local row. Not specified: once unlinked, should the *next* local edit auto-create a fresh Todoist task (natural outbox/upsert behavior), or should recreation be suppressed until a human explicitly re-links it? *Recommendation*: allow auto-recreation on next edit — simpler, and matches "Todoist is a linked execution surface" — but calling it out since it wasn't explicit in your rules.
3. **Outbox modeling: idempotent upsert vs. literal operation replay** — recommending one coalesced "current state" delivery per item (with `reason` kept for audit) over queuing/sequencing six distinct operation types. This is a deliberate deviation from a literal reading of your operation list — flagging for explicit approval rather than assuming.
4. **`todoist_orphans` disposition** — recommending Option B (migrate into `todoist_sync_events`) over leaving it temporarily or dropping it outright; confirm before the Phase 1 migration is written, since the new table's nullable `itemId`/`todoistTaskId` shape exists specifically to accommodate orphan rows.
5. **Scheduled Deployment fallback** — recommend deferring to Phase 4, decided with real data on how often request-driven triggers leave things stuck, rather than building it speculatively now.
6. **`presetTaskId` follow-up** — out of scope for this rewrite; flagged per rule #8 as a separate, pre-existing risk this inspection surfaced.

---

## First implementation PR

Smallest safe, reviewable slice = **Phase 1's schema + settings half only**:
- One migration: `todoist_settings`, `todoist_sync_events`, `todoist_webhook_events` — schema only, nothing yet reads/writes the latter two.
- `todoist_settings` GET/PUT routes + openapi entries + codegen.
- `todoist-context.tsx`/`todoist-settings.tsx` rewired from localStorage to the new endpoints.
- **No changes** to `tasks.ts`, `eblasts.ts`, `todoist.ts`'s sync logic, or the existing "Push to Todoist" buttons — everything currently working keeps working, byte-for-byte, until Phase 2.
- Reviewable by: running the migration, confirming the Settings page's project pickers survive a browser localStorage clear / a different browser, and confirming the existing manual sync button still behaves exactly as before.

---

## Phase 1 — Approved Final Scope (owner sign-off incorporated)

These supersede/refine the corresponding items above for **this PR only**. Later phases (webhook, retry drain, tasks.ts/eblasts.ts rewiring) are unaffected and remain as designed in sections 3–7.

**1. Remote-deletion policy (governs future phases, not this PR's behavior — no behavior ships in Phase 1)**: when `item:deleted` is eventually handled (Phase 3), the local task/e-blast is retained, `todoistTaskId` is cleared, and the event is logged as an explicit unlink (`todoist_sync_events`/future audit row with `reason='unlink'`). No automatic recreation on a later ordinary local edit — relinking is an explicit future Sync Health/Repair action, not an implicit side effect of the outbox's normal upsert behavior. This PR adds no webhook code and no new "unlink state" column — `reason='unlink'` already fits the `todoist_sync_events.reason` enum with no schema addition needed.

**2. Outbox delivery model — approved as designed**: `operation` ∈ {`upsert`, `delete`} (delivery shape), `reason` ∈ {`create`,`update`,`complete`,`reopen`,`delete`,`unlink`} (audit metadata only). One active (`pending`/`in_progress`) outbox row per live local task/e-blast.

**3. Outbox uniqueness — revised** (fixes a real gap in the original single-index design: Postgres unique indexes treat `NULL` values as pairwise distinct, so a single index on `(item_type, item_id)` would **not** stop duplicate delete-events for the same already-unlinked item, since `item_id` is `NULL` for those rows). Use **two** partial unique indexes instead of one:
```sql
-- (a) at most one active event per live local item
CREATE UNIQUE INDEX todoist_sync_events_item_active
  ON todoist_sync_events (item_type, item_id)
  WHERE item_id IS NOT NULL AND status IN ('pending', 'in_progress');

-- (b) at most one active delete event per already-unlinked remote item
CREATE UNIQUE INDEX todoist_sync_events_delete_active
  ON todoist_sync_events (item_type, todoist_task_id)
  WHERE item_id IS NULL AND operation = 'delete' AND status IN ('pending', 'in_progress');
```

**4. `todoist_orphans` — Option B, this PR only migrates data, does not touch behavior**: add `todoist_sync_events`; copy every existing `todoist_orphans` row into it as `operation='delete', reason='delete', status='pending', item_id=NULL, todoist_task_id=<copied>`. Do **not** drop `todoist_orphans` in this PR. Do **not** change `routes/tasks.ts`/`routes/eblasts.ts` delete handlers — they keep writing to `todoistOrphansTable` exactly as today until Phase 2.

**5. Production rollout — I will not run the production migration.** See "Production rollout" below for the exact commands, expectations, verification, and rollback you'll run.

### Exact file list for this PR

**New:**
- `lib/db/src/schema/todoistSettings.ts`
- `lib/db/src/schema/todoistSyncEvents.ts`
- `lib/db/src/schema/todoistWebhookEvents.ts`
- `lib/db/migrations/0008_<generated-name>.sql` (via `drizzle-kit generate`, plus a hand-added data-migration statement copying `todoist_orphans` → `todoist_sync_events`)
- `artifacts/api-server/src/routes/todoist-settings.ts` *(or folded into `routes/todoist.ts` — will decide while implementing based on which reads cleaner; either way it's additive, not a change to existing `todoist.ts` sync logic)*

**Modified:**
- `lib/db/src/schema/index.ts` — export the three new modules
- `lib/api-spec/openapi.yaml` — add `GET /export/todoist/settings`, `PUT /export/todoist/settings` + `TodoistSettings` schema
- `artifacts/api-server/src/routes/index.ts` — mount the settings router (only if it's a separate file)
- `artifacts/show-command-center/src/contexts/todoist-context.tsx` — replace `localStorage` read/write with the generated settings hooks
- (no change expected to `components/todoist-settings.tsx` — it already only consumes the context, not `localStorage` directly)

**Explicitly untouched:** `routes/tasks.ts`, `routes/eblasts.ts`, `routes/todoist.ts`'s `syncTask`/`syncEblast`/`drainOrphans`, `pages/show-detail.tsx`, `pages/calendar.tsx` (both "Push to Todoist" buttons stay exactly as-is).

### Migration plan (plain English)

1. `CREATE TABLE todoist_settings` — single row keyed `id text primary key default 'default'`, `task_project_id text`, `eblast_project_id text`, `updated_at timestamptz not null default now()`.
2. `CREATE TABLE todoist_sync_events` — the outbox table (columns as in section 4 above: `item_type`, `item_id`, `todoist_task_id`, `operation`, `reason`, `status`, `attempt_count`, `next_attempt_at`, `claimed_at`, `payload_snapshot jsonb`, `last_error`, `created_at`, `updated_at`), plus the two partial unique indexes from item 3 above and a `(status, next_attempt_at)` index for future claim queries.
3. `CREATE TABLE todoist_webhook_events` — inbound audit/dedup log (columns as in section 4 above), plus a unique index on `fingerprint` and a partial unique index on `provider_event_id` where not null.
4. Data migration: `INSERT INTO todoist_sync_events (item_type, item_id, todoist_task_id, operation, reason, status) SELECT item_type, NULL, todoist_task_id, 'delete', 'delete', 'pending' FROM todoist_orphans;` — copies every existing orphan row forward as a pending delete event. `todoist_orphans` itself is left in place, untouched, not dropped.

No existing table is altered. No existing column is added, renamed, or dropped. Everything in this migration is additive.

### Generated API artifacts to refresh

- `pnpm --filter @workspace/api-spec run codegen` after the `openapi.yaml` edit, which regenerates:
  - `lib/api-client-react/src/generated/api.ts` — adds `useGetTodoistSettings`/`useUpdateTodoistSettings` (exact hook names depend on the `operationId`s I choose, will report actual names after codegen runs)
  - `lib/api-zod/src/generated/` — adds the corresponding request/response Zod schemas

### Production rollout (you run these, not me)

```bash
# 1. Confirm you're pointed at the correct database
echo $DATABASE_URL   # must be the production connection string, not a local/dev one

# 2. Apply the migration
pnpm --filter @workspace/db run migrate

# 3. Verify the new tables exist and the data migration landed
psql "$DATABASE_URL" -c "\d todoist_settings"
psql "$DATABASE_URL" -c "\d todoist_sync_events"
psql "$DATABASE_URL" -c "\d todoist_webhook_events"
psql "$DATABASE_URL" -c "SELECT count(*) FROM todoist_sync_events WHERE operation='delete';"
psql "$DATABASE_URL" -c "SELECT count(*) FROM todoist_orphans;"
# the two counts above should match — every orphan row should have a corresponding sync_events row

# 4. Restart/redeploy the api-server so it picks up the new settings routes
```

**Rollback** (additive-only migration, so rollback is just reversing the additions):
```sql
DROP TABLE IF EXISTS todoist_webhook_events;
DROP TABLE IF EXISTS todoist_sync_events;
DROP TABLE IF EXISTS todoist_settings;
```
`todoist_orphans` was never touched, so no rollback is needed for it. Reverting the api-server deploy to the prior build is sufficient to remove the new settings routes/frontend behavior — no data cleanup required there since the frontend falls back to `localStorage` again automatically (the old code path isn't deleted, just no longer used, until this PR ships).

### After implementation, I will report

1. Every changed/created file.
2. The generated migration SQL in full, with the `todoist_orphans` → `todoist_sync_events` data migration called out and explained.
3. `pnpm run typecheck`, `pnpm run build`, and whatever test commands apply, with real output.
4. The exact production migration/verification/rollback commands (as drafted above, corrected for whatever the actual generated migration filename/contents turn out to be).
5. I will **not** commit unless you explicitly ask, and will **not** run the production migration myself.
