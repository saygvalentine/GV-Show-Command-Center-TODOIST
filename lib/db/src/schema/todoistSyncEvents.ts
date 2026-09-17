import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Durable outbound outbox for Todoist delivery.
//
// Created in this migration but not yet read or written by any route — the existing
// manual sync path and `todoist_orphans` continue to operate unchanged until Phase 2.
//
// Model: one *coalesced* active row per item carrying that item's current state, rather
// than a replay log of individual operations. `operation` is the delivery shape actually
// performed against the Todoist API; `reason` is audit metadata recording what triggered it.
export const todoistSyncEventsTable = pgTable(
  "todoist_sync_events",
  {
    id: serial("id").primaryKey(),
    // 'task' | 'eblast'
    itemType: text("item_type").notNull(),
    // Polymorphic (points at either tasks.id or eblasts.id) and null for deletes whose
    // local row is already gone — so it intentionally carries no foreign key.
    itemId: integer("item_id"),
    todoistTaskId: text("todoist_task_id"),
    // Delivery shape: 'upsert' | 'delete'
    operation: text("operation").notNull(),
    // Audit only: 'create' | 'update' | 'complete' | 'reopen' | 'delete' | 'unlink'
    reason: text("reason").notNull(),
    // 'pending' | 'in_progress' | 'delivered' | 'failed' | 'abandoned'
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    // Per-claim identity token, freshly issued each time a worker claims or reclaims this
    // row. Distinct from `claimedAt`: a timestamp alone can't disambiguate "the worker that
    // set claimed_at" from "whoever reclaimed it after a stale timeout" once the original
    // worker's external (Todoist) call is in flight outside any DB transaction/row lock.
    claimToken: text("claim_token"),
    // Bumped every time new local intent coalesces into an already-active row. Lets a
    // coalesce into an `in_progress` row (a worker may be mid-flight on an external Todoist
    // call, outside any DB transaction/row lock) record "there is newer work" without
    // touching `status`/`claimToken` and making the row claimable a second time while the
    // first claim's external call is still running.
    generation: integer("generation").notNull().default(1),
    payloadSnapshot: jsonb("payload_snapshot"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("todoist_sync_events_due_idx").on(table.status, table.nextAttemptAt),
    // At most one active event per live local item.
    uniqueIndex("todoist_sync_events_item_active")
      .on(table.itemType, table.itemId)
      .where(
        sql`${table.itemId} is not null and ${table.status} in ('pending', 'in_progress')`,
      ),
    // At most one active delete per already-unlinked remote task. Separate from the index
    // above because Postgres treats NULLs as distinct, so a single (item_type, item_id)
    // index would not deduplicate rows whose item_id is NULL.
    uniqueIndex("todoist_sync_events_delete_active")
      .on(table.itemType, table.todoistTaskId)
      .where(
        sql`${table.itemId} is null and ${table.operation} = 'delete' and ${table.status} in ('pending', 'in_progress')`,
      ),
  ],
);
