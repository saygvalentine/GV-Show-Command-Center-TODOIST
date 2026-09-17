import { db, todoistSyncEventsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { TodoistItemType } from "./types";

// The transaction handle passed to `db.transaction(async (tx) => {...})`. Enqueue
// calls always take this — never the top-level `db` — so a caller cannot forget to
// wrap the local write and the outbox insert in the same transaction.
export type OutboxTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Audit-only classification of why an event was enqueued. Delivery itself
// (Phase 3A.2) always re-reads the current local row and does not branch on this —
// see delivery.ts's `deliverCore`, which derives close/reopen purely from the
// item's current `completed`/`sent` value, not from any enqueue-time reason.
export type SyncEventReason = "create" | "update" | "complete" | "reopen" | "delete" | "unlink";

interface EnqueueSyncParams {
  itemType: TodoistItemType;
  itemId: number;
  reason: SyncEventReason;
}

// Enqueues (or coalesces into) the single active current-state job for a live item.
// Relies on the partial unique index `todoist_sync_events_item_active` (item_type,
// item_id) WHERE item_id IS NOT NULL AND status IN ('pending', 'in_progress') — a
// second call for the same item while a job is still active coalesces into that row
// rather than creating a second one. `generation` always increments (`reason` always
// updates) regardless of the existing row's status, but everything else is
// status-sensitive, evaluated via CASE expressions inside this single atomic
// ON CONFLICT ... DO UPDATE — not a read-then-write — so the branch is race-safe:
//   - existing row `pending`: full reset (this mirrors a fresh enqueue — nothing was
//     claimed, so there's no in-flight ownership to protect).
//   - existing row `in_progress`: status/claimToken/claimedAt/attemptCount/
//     nextAttemptAt/lastError are left completely untouched. A worker may be mid-flight
//     on an external Todoist call for this row (outside any DB transaction/row lock);
//     forcing status back to `pending` here would make the row claimable a second time
//     while that call is still running. The bumped `generation` is how a later
//     finalize/reclaim step (Phase 3A.2) detects that newer local intent arrived while
//     it was working, without ever re-opening the row to a second concurrent claim.
// New rows always start at generation 1 — set explicitly here (matching this file's
// existing style of always spelling out `status`/`operation` rather than leaning on
// column defaults) rather than relying on the schema's `default(1)`.
export async function enqueueSync(tx: OutboxTx, params: EnqueueSyncParams): Promise<void> {
  await tx
    .insert(todoistSyncEventsTable)
    .values({
      itemType: params.itemType,
      itemId: params.itemId,
      operation: "upsert",
      reason: params.reason,
      status: "pending",
      generation: 1,
    })
    .onConflictDoUpdate({
      target: [todoistSyncEventsTable.itemType, todoistSyncEventsTable.itemId],
      targetWhere: sql`${todoistSyncEventsTable.itemId} is not null and ${todoistSyncEventsTable.status} in ('pending', 'in_progress')`,
      set: {
        reason: params.reason,
        generation: sql`${todoistSyncEventsTable.generation} + 1`,
        updatedAt: new Date(),
        status: sql`case when ${todoistSyncEventsTable.status} = 'in_progress' then ${todoistSyncEventsTable.status} else 'pending' end`,
        claimToken: sql`case when ${todoistSyncEventsTable.status} = 'in_progress' then ${todoistSyncEventsTable.claimToken} else null end`,
        claimedAt: sql`case when ${todoistSyncEventsTable.status} = 'in_progress' then ${todoistSyncEventsTable.claimedAt} else null end`,
        attemptCount: sql`case when ${todoistSyncEventsTable.status} = 'in_progress' then ${todoistSyncEventsTable.attemptCount} else 0 end`,
        nextAttemptAt: sql`case when ${todoistSyncEventsTable.status} = 'in_progress' then ${todoistSyncEventsTable.nextAttemptAt} else now() end`,
        lastError: sql`case when ${todoistSyncEventsTable.status} = 'in_progress' then ${todoistSyncEventsTable.lastError} else null end`,
      },
    });
}

interface SupersedeSyncParams {
  itemType: TodoistItemType;
  itemId: number;
}

// Marks any still-active current-state job for this exact item as terminal ahead of a
// mapped local delete. Without this, a pending/in-progress upsert job (keyed on
// (item_type, item_id) via `todoist_sync_events_item_active`) and the delete job the
// same deletion is about to enqueue (keyed on (item_type, todoist_task_id) via
// `todoist_sync_events_delete_active`) sit on two different partial unique indexes and
// could both remain active at once — ambiguous, stale queue state once the local row is
// gone. Reuses the existing `abandoned` status rather than introducing a new one.
export async function supersedeSync(tx: OutboxTx, params: SupersedeSyncParams): Promise<void> {
  await tx
    .update(todoistSyncEventsTable)
    .set({
      status: "abandoned",
      lastError: "Superseded by local deletion",
      claimToken: null,
      claimedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(todoistSyncEventsTable.itemType, params.itemType),
        eq(todoistSyncEventsTable.itemId, params.itemId),
        inArray(todoistSyncEventsTable.status, ["pending", "in_progress"]),
      ),
    );
}

interface EnqueueDeleteParams {
  itemType: TodoistItemType;
  todoistTaskId: string;
  reason?: SyncEventReason;
}

// Enqueues (or coalesces into) a durable delete job for an item that was mapped
// to a remote Todoist task at the moment it was locally deleted. `itemId` is
// deliberately null here — the local row is already gone by the time this
// commits — so identity for this job is `todoistTaskId` alone. Relies on
// `todoist_sync_events_delete_active` (item_type, todoist_task_id) WHERE
// item_id IS NULL AND operation = 'delete' AND status IN ('pending', 'in_progress').
//
// Unlike `enqueueSync`, `generation` is never bumped here and is left out of `set`
// entirely (so it keeps whatever value the row already has). `enqueueSync`'s bumped
// generation exists so a later finalize/reclaim step can tell that newer local state
// needs to be re-read — but a delete has no local row left to re-read (`itemId` is
// null): every repeated delete intent for the same `todoistTaskId` is the same
// idempotent end state, not newer work a worker would need to notice.
export async function enqueueDelete(tx: OutboxTx, params: EnqueueDeleteParams): Promise<void> {
  const reason = params.reason ?? "delete";
  await tx
    .insert(todoistSyncEventsTable)
    .values({
      itemType: params.itemType,
      itemId: null,
      todoistTaskId: params.todoistTaskId,
      operation: "delete",
      reason,
      status: "pending",
      generation: 1,
    })
    .onConflictDoUpdate({
      target: [todoistSyncEventsTable.itemType, todoistSyncEventsTable.todoistTaskId],
      targetWhere: sql`${todoistSyncEventsTable.itemId} is null and ${todoistSyncEventsTable.operation} = 'delete' and ${todoistSyncEventsTable.status} in ('pending', 'in_progress')`,
      set: {
        reason,
        updatedAt: new Date(),
        status: sql`case when ${todoistSyncEventsTable.status} = 'in_progress' then ${todoistSyncEventsTable.status} else 'pending' end`,
        claimToken: sql`case when ${todoistSyncEventsTable.status} = 'in_progress' then ${todoistSyncEventsTable.claimToken} else null end`,
        claimedAt: sql`case when ${todoistSyncEventsTable.status} = 'in_progress' then ${todoistSyncEventsTable.claimedAt} else null end`,
        attemptCount: sql`case when ${todoistSyncEventsTable.status} = 'in_progress' then ${todoistSyncEventsTable.attemptCount} else 0 end`,
        nextAttemptAt: sql`case when ${todoistSyncEventsTable.status} = 'in_progress' then ${todoistSyncEventsTable.nextAttemptAt} else now() end`,
        lastError: sql`case when ${todoistSyncEventsTable.status} = 'in_progress' then ${todoistSyncEventsTable.lastError} else null end`,
      },
    });
}
