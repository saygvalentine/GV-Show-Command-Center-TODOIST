CREATE TABLE "preset_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"due_date_offset" integer,
	"due_date_unit" text,
	"due_date_direction" text,
	"due_date_anchor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "preset_tasks" ("name", "category", "due_date_offset", "due_date_unit", "due_date_direction", "due_date_anchor") VALUES
  ('Initial Contact Account Executive', 'Fire Marshal', 60, 'cal', 'before', 'moveInDate'),
  ('Check In / Submit', 'Fire Marshal', 30, 'biz', 'before', 'moveInDate'),
  ('Hard Deadline', 'Fire Marshal', 30, 'cal', 'before', 'moveInDate'),
  ('Contact Client / Give Deadline', 'ID Sign', 30, 'cal', 'before', 'moveInDate'),
  ('ID Sign Deadline', 'ID Sign', 12, 'biz', 'before', 'moveInDate'),
  ('Submit Order', 'ID Sign', 8, 'biz', 'before', 'moveInDate'),
  ('Contact Declared but Not Received', 'Warehouse Manifest', 3, 'biz', 'before', 'advanceWarehouseDate'),
  ('Get Bucket Due Dates & Quantities', 'Show Bucket', 10, 'biz', 'before', 'moveInDate'),
  ('Create Carpet Plan', 'Show Bucket', 1, 'cal', 'after', 'onlineOrderDeadline'),
  ('Add CC Tags to XBR List', 'Show Bucket', 5, 'biz', 'before', 'moveInDate'),
  ('Finalize Carpet Plan', 'Show Bucket', 5, 'biz', 'before', 'moveInDate'),
  ('Begin Bucket Creation', 'Show Bucket', 5, 'biz', 'before', 'moveInDate'),
  ('Bucket Due Date', 'Show Bucket', NULL, NULL, NULL, NULL),
  ('Send e-Blast for A.E. Vehicle Spotting', 'Vehicle Spotting', 60, 'cal', 'before', 'moveInDate'),
  ('Check Vehicle Spotting / Provide To Beau', 'Vehicle Spotting', 40, 'cal', 'before', 'moveInDate'),
  ('Check Vehicle Spotting / Provide To Beau 2', 'Vehicle Spotting', 30, 'biz', 'before', 'moveInDate'),
  ('Contact Electrical Provider', 'Electrical', 1, 'cal', 'after', 'onlineOrderDeadline');
