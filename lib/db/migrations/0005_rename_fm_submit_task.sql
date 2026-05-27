UPDATE "preset_tasks"
SET "name" = 'Submit To FM/EC'
WHERE "name" = 'Check In / Submit' AND "category" = 'Fire Marshal';
--> statement-breakpoint
UPDATE "tasks"
SET "name" = 'Submit To FM/EC'
WHERE "name" = 'Check In / Submit' AND "category" = 'Fire Marshal';
