import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import {
  db,
  todoistSyncEventsTable,
  tasksTable,
  eblastsTable,
  showsTable,
  todoistSettingsTable,
  TODOIST_SETTINGS_ID,
} from "@workspace/db";
import { deliverTask, deliverEblast, defaultDeliveryDeps, type DeliveryDeps } from "./delivery";
import { buildDeliveryFailureLog, type DeliveryOutcome, type TodoistItemType } from "./types";
import { logger } from "../logger";

export interface DrainOptions {
  batchSize?: number;
  maxRuntimeMs?: number;
  concurrency?: number;
  deps?: DeliveryDeps;
  now?: () => Date;
  newClaimToken?: () => string;
}

export interface DrainSummary {
  claimed: number;
  delivered: number;
  requeued: number;
  failed: number;
  abandoned: number;
  lostClaim: number;
}

// The row shape returned by a successful claim/reclaim — everything `processClaimedEvent`
// needs, and nothing more (no `payloadSnapshot`: delivery always re-reads the live local
// row instead, per the approved outbox model).
export interface ClaimedEvent {
  id: number;
  itemType: TodoistItemType;
  itemId: number | null;
  todoistTaskId: string | null;
  operation: "upsert" | "delete";
  claimToken: string;
  generation: number;
  attemptCount: number;
}

type ProcessOutcome = "delivered" | "requeued" | "failed" | "abandoned" | "lostClaim";

const STALE_CLAIM_THRESHOLD_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_SECONDS = [30, 60, 120, 240, 480, 960, 1920, 3840];
const JITTER_FRACTION = 0.1;
const MAX_ERROR_LENGTH = 500;

// Deterministic exponential backoff: `attemptCount` is the already-incremented count
// from the claim/reclaim that just made this attempt, so attempt 1 maps to the first
// (shortest) delay. `random` is injectable so tests can assert exact bounds instead of
// tolerating flakiness. Jitter is additive-only (never below the base delay) so backoff
// never accidentally gets shorter than the schedule intends.
export function backoffMs(attemptCount: number, random: () => number = Math.random): number {
  const index = Math.min(Math.max(attemptCount, 1), BACKOFF_BASE_SECONDS.length) - 1;
  const baseMs = BACKOFF_BASE_SECONDS[index] * 1000;
  return baseMs + baseMs * JITTER_FRACTION * random();
}

function sanitizeError(message: string | undefined): string {
  const text = message ?? "Unknown Todoist delivery error";
  return text.length > MAX_ERROR_LENGTH ? text.slice(0, MAX_ERROR_LENGTH) : text;
}

function mapRawClaimRow(row: Record<string, unknown>): ClaimedEvent {
  return {
    id: Number(row.id),
    itemType: row.item_type as TodoistItemType,
    itemId: row.item_id === null ? null : Number(row.item_id),
    todoistTaskId: row.todoist_task_id as string | null,
    operation: row.operation as "upsert" | "delete",
    claimToken: row.claim_token as string,
    generation: Number(row.generation),
    attemptCount: Number(row.attempt_count),
  };
}

// Drizzle's builder cannot express `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED)`,
// the standard race-safe "claim one queue row" idiom — so this is raw SQL, wrapped in its
// own short transaction. The SELECT's row lock and the UPDATE that claims it happen as one
// atomic statement: a second concurrent caller running the same statement skips any row
// this one is still holding, so two workers (or a claim pass and a reclaim pass, which
// never compete for the same row anyway since their status predicates are disjoint) can
// never claim the same id.
export async function claimOnePendingEvent(claimToken: string, at: Date): Promise<ClaimedEvent | null> {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      WITH candidate AS (
        SELECT id FROM todoist_sync_events
        WHERE status = 'pending' AND next_attempt_at <= ${at}
        ORDER BY next_attempt_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE todoist_sync_events e
      SET status = 'in_progress',
          claim_token = ${claimToken},
          claimed_at = ${at},
          attempt_count = e.attempt_count + 1,
          updated_at = ${at}
      FROM candidate
      WHERE e.id = candidate.id
      RETURNING e.id, e.item_type, e.item_id, e.todoist_task_id, e.operation,
                e.claim_token, e.generation, e.attempt_count
    `);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapRawClaimRow(row) : null;
  });
}

// Same shape as claimOnePendingEvent, but for `in_progress` rows whose `claimed_at` is
// older than the stale threshold — a worker that died mid-flight leaves exactly this
// state behind. `status` and `generation` are deliberately absent from SET: status stays
// `in_progress` (this never makes a row claimable a second time by a normal claim, since
// claim only selects `pending` rows) and generation is untouched regardless of value.
export async function reclaimOneStaleEvent(claimToken: string, at: Date): Promise<ClaimedEvent | null> {
  const staleThreshold = new Date(at.getTime() - STALE_CLAIM_THRESHOLD_MS);
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      WITH candidate AS (
        SELECT id FROM todoist_sync_events
        WHERE status = 'in_progress' AND claimed_at < ${staleThreshold}
        ORDER BY claimed_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE todoist_sync_events e
      SET claim_token = ${claimToken},
          claimed_at = ${at},
          attempt_count = e.attempt_count + 1,
          updated_at = ${at}
      FROM candidate
      WHERE e.id = candidate.id
      RETURNING e.id, e.item_type, e.item_id, e.todoist_task_id, e.operation,
                e.claim_token, e.generation, e.attempt_count
    `);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapRawClaimRow(row) : null;
  });
}

// Plain, unlocked read — this is a courtesy check to avoid burning a Todoist call on a
// claim that's already been reclaimed out from under this worker (e.g. it sat behind a
// concurrency gate long enough to go stale). It is NOT the safety mechanism: every write
// below is independently conditioned on `id + status='in_progress' + claim_token`, so an
// ownership loss this check misses is still caught — as a 0-row finalize — at write time.
async function selectOwnership(id: number): Promise<{ status: string; claimToken: string | null; generation: number } | null> {
  const result = await db.execute(sql`SELECT status, claim_token, generation FROM todoist_sync_events WHERE id = ${id}`);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return { status: row.status as string, claimToken: row.claim_token as string | null, generation: Number(row.generation) };
}

function ownedBy(row: { status: string; claimToken: string | null } | null, claimToken: string): boolean {
  return row !== null && row.status === "in_progress" && row.claimToken === claimToken;
}

// Every finalize/release below shares this ownership predicate. A 0-row result means the
// claim was reclaimed since this worker last checked — the caller must treat that as a
// lost claim and must not have any other effect (see `ownedByClause`'s callers).
function ownedByClause(id: number, claimToken: string) {
  return and(
    eq(todoistSyncEventsTable.id, id),
    eq(todoistSyncEventsTable.status, "in_progress"),
    eq(todoistSyncEventsTable.claimToken, claimToken),
  );
}

async function finalizeAbandoned(id: number, claimToken: string, at: Date): Promise<boolean> {
  const rows = await db
    .update(todoistSyncEventsTable)
    .set({ status: "abandoned", claimToken: null, claimedAt: null, updatedAt: at })
    .where(ownedByClause(id, claimToken))
    .returning({ id: todoistSyncEventsTable.id });
  return rows.length > 0;
}

// Shared by every terminal-failure path (missing configuration, delete missing a
// mapping, an ambiguous unmapped-create failure, and an exhausted retry schedule) — all
// of them are the same write: terminal `failed`, claim cleared, `lastError` recorded.
async function finalizeFailed(id: number, claimToken: string, at: Date, error: string): Promise<boolean> {
  const rows = await db
    .update(todoistSyncEventsTable)
    .set({ status: "failed", claimToken: null, claimedAt: null, lastError: error, updatedAt: at })
    .where(ownedByClause(id, claimToken))
    .returning({ id: todoistSyncEventsTable.id });
  return rows.length > 0;
}

async function finalizeRequeueAfterFailure(id: number, claimToken: string, at: Date, nextAttemptAt: Date, error: string): Promise<boolean> {
  const rows = await db
    .update(todoistSyncEventsTable)
    .set({ status: "pending", claimToken: null, claimedAt: null, nextAttemptAt, lastError: error, updatedAt: at })
    .where(ownedByClause(id, claimToken))
    .returning({ id: todoistSyncEventsTable.id });
  return rows.length > 0;
}

// Delete events never condition finalize on generation (it's intentionally stable across
// duplicate delete intent), so this single unconditional-on-generation "delivered" write
// is correct for deletes. Upserts use the generation-aware pair below instead.
async function finalizeDeliveredNoGenerationCheck(id: number, claimToken: string, at: Date): Promise<boolean> {
  const rows = await db
    .update(todoistSyncEventsTable)
    .set({ status: "delivered", claimToken: null, claimedAt: null, lastError: null, updatedAt: at })
    .where(ownedByClause(id, claimToken))
    .returning({ id: todoistSyncEventsTable.id });
  return rows.length > 0;
}

// The two upsert-success finalize attempts are mutually exclusive by their generation
// predicate: exactly one of them can affect a row, or neither can (lost claim). Trying
// the exact-match "delivered" write first, then falling back to the ">" "requeue" write,
// lets the caller tell all three outcomes apart from return values alone.
async function finalizeDeliveredWithGeneration(id: number, claimToken: string, at: Date, capturedGeneration: number): Promise<boolean> {
  const rows = await db
    .update(todoistSyncEventsTable)
    .set({ status: "delivered", claimToken: null, claimedAt: null, lastError: null, updatedAt: at })
    .where(and(ownedByClause(id, claimToken), eq(todoistSyncEventsTable.generation, capturedGeneration)))
    .returning({ id: todoistSyncEventsTable.id });
  return rows.length > 0;
}

async function finalizeRequeueOnNewerGeneration(id: number, claimToken: string, at: Date, capturedGeneration: number): Promise<boolean> {
  const rows = await db
    .update(todoistSyncEventsTable)
    .set({ status: "pending", claimToken: null, claimedAt: null, nextAttemptAt: at, lastError: null, updatedAt: at })
    .where(and(ownedByClause(id, claimToken), gt(todoistSyncEventsTable.generation, capturedGeneration)))
    .returning({ id: todoistSyncEventsTable.id });
  return rows.length > 0;
}

async function loadTodoistProjectId(itemType: TodoistItemType): Promise<string | null> {
  const [row] = await db.select().from(todoistSettingsTable).where(eq(todoistSettingsTable.id, TODOIST_SETTINGS_ID));
  if (!row) return null;
  return (itemType === "task" ? row.taskProjectId : row.eblastProjectId) ?? null;
}

async function loadTaskWithShow(itemId: number): Promise<{ item: typeof tasksTable.$inferSelect; showName: string } | null> {
  const rows = await db
    .select({ item: tasksTable, showName: showsTable.name })
    .from(tasksTable)
    .innerJoin(showsTable, eq(tasksTable.showId, showsTable.id))
    .where(eq(tasksTable.id, itemId));
  return rows[0] ?? null;
}

async function loadEblastWithShow(itemId: number): Promise<{ item: typeof eblastsTable.$inferSelect; showName: string } | null> {
  const rows = await db
    .select({ item: eblastsTable, showName: showsTable.name })
    .from(eblastsTable)
    .innerJoin(showsTable, eq(eblastsTable.showId, showsTable.id))
    .where(eq(eblastsTable.id, itemId));
  return rows[0] ?? null;
}

function logLostClaim(event: ClaimedEvent, stage: "pre_call" | "finalize"): void {
  logger.info(
    {
      event: "todoist_outbox_lost_claim",
      eventId: event.id,
      itemType: event.itemType,
      itemId: event.itemId,
      todoistTaskId: event.todoistTaskId,
      operation: event.operation,
      stage,
    },
    "todoist_outbox_lost_claim",
  );
}

function logExhausted(event: ClaimedEvent, error: string): void {
  logger.error(
    {
      event: "todoist_delivery_exhausted",
      eventId: event.id,
      itemType: event.itemType,
      itemId: event.itemId,
      todoistTaskId: event.todoistTaskId,
      operation: event.operation,
      generation: event.generation,
      attemptCount: event.attemptCount,
      error,
    },
    "todoist_delivery_exhausted",
  );
}

function logAmbiguousCreate(event: ClaimedEvent, capturedGeneration: number, error: string): void {
  logger.error(
    {
      event: "todoist_create_outcome_ambiguous",
      eventId: event.id,
      itemType: event.itemType,
      itemId: event.itemId,
      generation: capturedGeneration,
      attemptCount: event.attemptCount,
      error,
    },
    "todoist_create_outcome_ambiguous",
  );
}

// Deletes have no `DeliveryResult` (they never go through `deliverCore`), so
// `buildDeliveryFailureLog`'s shape — which requires a non-null numeric `itemId` — does
// not apply; this is the minimal equivalent for the delete path.
function logDeleteFailure(event: ClaimedEvent, error: string): void {
  logger.error(
    {
      event: "todoist_delivery_failed",
      itemType: event.itemType,
      itemId: event.itemId,
      todoistTaskId: event.todoistTaskId,
      error,
    },
    "todoist_delivery_failed",
  );
}

const SUCCESS_LIKE_OUTCOMES: ReadonlySet<DeliveryOutcome> = new Set([
  "created",
  "updated",
  "deleted",
  "skipped_no_due_date",
  "unlinked_remote_missing",
]);

async function processUpsertEvent(event: ClaimedEvent, deps: DeliveryDeps, at: Date): Promise<ProcessOutcome> {
  // Checked first — before any local-item load, settings load, or Todoist request. A
  // claim lost to a reclaim or to a concurrent local-delete's `supersedeSync` must
  // short-circuit immediately here, rather than running far enough to synthesize a
  // terminal outcome (e.g. "missing configuration") for a row this worker no longer owns.
  const ownership = await selectOwnership(event.id);
  if (!ownedBy(ownership, event.claimToken)) {
    logLostClaim(event, "pre_call");
    return "lostClaim";
  }
  const capturedGeneration = ownership!.generation;

  const itemId = event.itemId as number; // upserts always carry a non-null itemId (enforced by the active-item unique index)

  const local = event.itemType === "task" ? await loadTaskWithShow(itemId) : await loadEblastWithShow(itemId);
  if (!local) {
    const ok = await finalizeAbandoned(event.id, event.claimToken, at);
    if (!ok) logLostClaim(event, "finalize");
    return ok ? "abandoned" : "lostClaim";
  }

  const projectId = await loadTodoistProjectId(event.itemType);
  if (!projectId) {
    const message = `Todoist project not configured for ${event.itemType}`;
    const ok = await finalizeFailed(event.id, event.claimToken, at, message);
    if (!ok) logLostClaim(event, "finalize");
    return ok ? "failed" : "lostClaim";
  }

  const hadMapping = local.item.todoistTaskId !== null;
  const result =
    event.itemType === "task"
      ? await deliverTask(local.item as typeof tasksTable.$inferSelect, local.showName, projectId, deps)
      : await deliverEblast(local.item as typeof eblastsTable.$inferSelect, local.showName, projectId, deps);

  if (SUCCESS_LIKE_OUTCOMES.has(result.outcome)) {
    const delivered = await finalizeDeliveredWithGeneration(event.id, event.claimToken, at, capturedGeneration);
    if (delivered) return "delivered";

    const requeued = await finalizeRequeueOnNewerGeneration(event.id, event.claimToken, at, capturedGeneration);
    if (requeued) return "requeued";

    logLostClaim(event, "finalize");
    return "lostClaim";
  }

  // outcome === "failed" from here on.
  if (!hadMapping) {
    // No existing remote mapping before this attempt: if Todoist actually created the
    // task and only the local persist step was lost (crash, timeout, ambiguous 5xx),
    // retrying here would create a duplicate. Terminal, surfaced for manual reconciliation
    // — never a blind create retry.
    const message = sanitizeError(result.error);
    const ok = await finalizeFailed(event.id, event.claimToken, at, message);
    logAmbiguousCreate(event, capturedGeneration, message);
    if (!ok) logLostClaim(event, "finalize");
    return ok ? "failed" : "lostClaim";
  }

  const failureLog = buildDeliveryFailureLog(result);
  if (failureLog) logger.error(failureLog, failureLog.event);

  if (event.attemptCount < MAX_ATTEMPTS) {
    const nextAttemptAt = new Date(at.getTime() + backoffMs(event.attemptCount));
    const ok = await finalizeRequeueAfterFailure(event.id, event.claimToken, at, nextAttemptAt, sanitizeError(result.error));
    if (!ok) logLostClaim(event, "finalize");
    return ok ? "requeued" : "lostClaim";
  }

  const ok = await finalizeFailed(event.id, event.claimToken, at, sanitizeError(result.error));
  logExhausted(event, sanitizeError(result.error));
  if (!ok) logLostClaim(event, "finalize");
  return ok ? "failed" : "lostClaim";
}

async function processDeleteEvent(event: ClaimedEvent, deps: DeliveryDeps, at: Date): Promise<ProcessOutcome> {
  // Checked first, before any Todoist request — same rationale as processUpsertEvent.
  const ownership = await selectOwnership(event.id);
  if (!ownedBy(ownership, event.claimToken)) {
    logLostClaim(event, "pre_call");
    return "lostClaim";
  }

  if (!event.todoistTaskId) {
    const ok = await finalizeFailed(event.id, event.claimToken, at, "Delete event missing todoistTaskId");
    if (!ok) logLostClaim(event, "finalize");
    return ok ? "failed" : "lostClaim";
  }

  let error: string | null = null;
  try {
    // A thrown error is a genuine failure; a resolved call (including the 404-as-null
    // idempotency `todoistRequest` already implements) is success — same semantics
    // `deliverCore` uses for its own delete path.
    await deps.todoistRequest("DELETE", `/api/v1/tasks/${event.todoistTaskId}`);
  } catch (err) {
    error = sanitizeError((err as Error).message);
  }

  if (error === null) {
    const ok = await finalizeDeliveredNoGenerationCheck(event.id, event.claimToken, at);
    if (!ok) logLostClaim(event, "finalize");
    return ok ? "delivered" : "lostClaim";
  }

  logDeleteFailure(event, error);

  if (event.attemptCount < MAX_ATTEMPTS) {
    const nextAttemptAt = new Date(at.getTime() + backoffMs(event.attemptCount));
    const ok = await finalizeRequeueAfterFailure(event.id, event.claimToken, at, nextAttemptAt, error);
    if (!ok) logLostClaim(event, "finalize");
    return ok ? "requeued" : "lostClaim";
  }

  const ok = await finalizeFailed(event.id, event.claimToken, at, error);
  logExhausted(event, error);
  if (!ok) logLostClaim(event, "finalize");
  return ok ? "failed" : "lostClaim";
}

export async function processClaimedEvent(event: ClaimedEvent, deps: DeliveryDeps, at: Date): Promise<ProcessOutcome> {
  return event.operation === "delete" ? processDeleteEvent(event, deps, at) : processUpsertEvent(event, deps, at);
}

function tally(summary: DrainSummary, outcome: ProcessOutcome): void {
  summary[outcome]++;
}

// Pending work always takes priority; stale reclaim only fills in once no due pending
// work is left for this attempt to find.
async function claimNext(newClaimToken: () => string, now: () => Date): Promise<ClaimedEvent | null> {
  const pending = await claimOnePendingEvent(newClaimToken(), now());
  if (pending) return pending;
  return reclaimOneStaleEvent(newClaimToken(), now());
}

// Bounded, request-driven, one-shot drain — callable directly, never self-scheduling (no
// `setInterval`/timer of any kind), matching the autoscale-safe operational constraints
// this project's outbox work has followed since Phase 3A.1.
//
// Each concurrent worker claims exactly one event at a time and always runs it to
// completion before claiming again — it never claims ahead of what it can immediately
// process. That means the runtime deadline only ever gates the *next claim*: an event
// that has already been claimed always finishes (delivered/requeued/failed/abandoned),
// so a short `maxRuntimeMs` can never strand a freshly claimed event sitting
// `in_progress` — the previous batch-then-process design could do exactly that, since a
// deadline could expire between claiming a row and that row's turn to be processed.
export async function drainTodoistOutbox(options: DrainOptions = {}): Promise<DrainSummary> {
  const batchSize = options.batchSize ?? 10;
  const maxRuntimeMs = options.maxRuntimeMs ?? 20_000;
  const concurrency = options.concurrency ?? 3;
  const deps = options.deps ?? defaultDeliveryDeps;
  const now = options.now ?? (() => new Date());
  const newClaimToken = options.newClaimToken ?? randomUUID;

  const summary: DrainSummary = { claimed: 0, delivered: 0, requeued: 0, failed: 0, abandoned: 0, lostClaim: 0 };
  const deadline = Date.now() + maxRuntimeMs;
  let claimSlotsUsed = 0;

  async function worker(): Promise<void> {
    for (;;) {
      // No `await` between this check and the increment below, so two concurrent
      // workers can never both claim the last slot under batchSize.
      if (Date.now() >= deadline || claimSlotsUsed >= batchSize) return;
      claimSlotsUsed++;
      const event = await claimNext(newClaimToken, now);
      if (!event) {
        claimSlotsUsed--; // no row was actually claimed — release the reserved slot
        return;
      }
      summary.claimed++;
      const outcome = await processClaimedEvent(event, deps, now());
      tally(summary, outcome);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));

  return summary;
}
