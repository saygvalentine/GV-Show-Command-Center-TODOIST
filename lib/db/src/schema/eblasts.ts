import { pgTable, text, serial, timestamp, integer, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { showsTable } from "./shows";

export const eblastsTable = pgTable("eblasts", {
  id: serial("id").primaryKey(),
  showId: integer("show_id").notNull().references(() => showsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dueDate: date("due_date"),
  dueDateRule: text("due_date_rule"),
  sent: boolean("sent").notNull().default(false),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  notes: text("notes"),
  gcalEventId: text("gcal_event_id"),
  todoistTaskId: text("todoist_task_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEblastSchema = createInsertSchema(eblastsTable).omit({ id: true, createdAt: true });
export type InsertEblast = z.infer<typeof insertEblastSchema>;
export type Eblast = typeof eblastsTable.$inferSelect;
