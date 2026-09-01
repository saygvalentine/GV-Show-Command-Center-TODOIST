CREATE TABLE "todoist_orphans" (
	"id" serial PRIMARY KEY NOT NULL,
	"todoist_task_id" text NOT NULL,
	"item_type" text DEFAULT 'task' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "todoist_task_id" text;--> statement-breakpoint
ALTER TABLE "eblasts" ADD COLUMN "todoist_task_id" text;
