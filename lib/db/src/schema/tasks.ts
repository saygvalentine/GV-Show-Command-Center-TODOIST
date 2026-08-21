import { pgTable, text, serial, timestamp, integer, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { showsTable } from "./shows";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  showId: integer("show_id").notNull().references(() => showsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category"),
  dueDate: date("due_date"),
  dueDateRule: text("due_date_rule"),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  gcalEventId: text("gcal_event_id"),
  todoistTaskId: text("todoist_task_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
