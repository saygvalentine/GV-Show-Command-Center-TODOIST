CREATE TABLE "todoist_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"task_project_id" text,
	"eblast_project_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todoist_sync_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_type" text NOT NULL,
	"item_id" integer,
	"todoist_task_id" text,
	"operation" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"payload_snapshot" jsonb,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todoist_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_event_id" text,
	"fingerprint" text NOT NULL,
	"event_type" text NOT NULL,
	"todoist_task_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "todoist_sync_events_due_idx" ON "todoist_sync_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "todoist_sync_events_item_active" ON "todoist_sync_events" USING btree ("item_type","item_id") WHERE "todoist_sync_events"."item_id" is not null and "todoist_sync_events"."status" in ('pending', 'in_progress');--> statement-breakpoint
CREATE UNIQUE INDEX "todoist_sync_events_delete_active" ON "todoist_sync_events" USING btree ("item_type","todoist_task_id") WHERE "todoist_sync_events"."item_id" is null and "todoist_sync_events"."operation" = 'delete' and "todoist_sync_events"."status" in ('pending', 'in_progress');--> statement-breakpoint
CREATE UNIQUE INDEX "todoist_webhook_events_fingerprint_key" ON "todoist_webhook_events" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "todoist_webhook_events_provider_event_id_key" ON "todoist_webhook_events" USING btree ("provider_event_id") WHERE "todoist_webhook_events"."provider_event_id" is not null;--> statement-breakpoint
-- Data migration (hand-written, not emitted by drizzle-kit):
-- Carry every existing Todoist delete-intent in `todoist_orphans` forward into the new
-- outbox as a pending delete event. `todoist_orphans` is deliberately NOT dropped here and
-- the existing task/e-blast delete handlers keep writing to it unchanged; nothing reads
-- these new rows until Phase 2 wires up outbound delivery.
--
-- DISTINCT dedupes the source (the legacy table has no uniqueness constraint), and the
-- NOT EXISTS guard makes re-running this statement a no-op — together they keep the
-- `todoist_sync_events_delete_active` partial unique index satisfied.
INSERT INTO "todoist_sync_events" ("item_type", "item_id", "todoist_task_id", "operation", "reason", "status")
SELECT DISTINCT o."item_type", NULL::integer, o."todoist_task_id", 'delete', 'delete', 'pending'
FROM "todoist_orphans" o
WHERE NOT EXISTS (
  SELECT 1 FROM "todoist_sync_events" e
  WHERE e."item_type" = o."item_type"
    AND e."todoist_task_id" = o."todoist_task_id"
    AND e."item_id" IS NULL
    AND e."operation" = 'delete'
    AND e."status" IN ('pending', 'in_progress')
);