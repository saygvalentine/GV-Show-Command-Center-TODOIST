CREATE TABLE "gcal_orphans" (
  "id" serial PRIMARY KEY NOT NULL,
  "gcal_event_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
