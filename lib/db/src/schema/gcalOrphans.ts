import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const gcalOrphansTable = pgTable("gcal_orphans", {
  id: serial("id").primaryKey(),
  gcalEventId: text("gcal_event_id").notNull(),
  calendarType: text("calendar_type").notNull().default("task"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
