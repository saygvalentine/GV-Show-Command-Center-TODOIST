import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Inbound Todoist webhook audit + explicit delivery-deduplication log.
//
// Created in this migration but not yet read or written by any route — no webhook
// endpoint exists until Phase 3.
//
// Dedup is by stored key, not by "the resulting local state already matches":
// an insert that conflicts on `fingerprint` (or `provider_event_id`) means the delivery
// is a repeat and must not be reprocessed.
export const todoistWebhookEventsTable = pgTable(
  "todoist_webhook_events",
  {
    id: serial("id").primaryKey(),
    // Populated when Todoist's payload carries a stable event id; null otherwise.
    providerEventId: text("provider_event_id"),
    // Always computed — deterministic fallback dedupe key derived from the payload.
    fingerprint: text("fingerprint").notNull(),
    // 'item:completed' | 'item:uncompleted' | 'item:deleted' | ...
    eventType: text("event_type").notNull(),
    todoistTaskId: text("todoist_task_id").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    // 'received' | 'processed' | 'unmatched' | 'error'
    status: text("status").notNull().default("received"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (table) => [
    uniqueIndex("todoist_webhook_events_fingerprint_key").on(table.fingerprint),
    uniqueIndex("todoist_webhook_events_provider_event_id_key")
      .on(table.providerEventId)
      .where(sql`${table.providerEventId} is not null`),
  ],
);
