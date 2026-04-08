import { pgTable, text, serial, timestamp, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const officeTasksTable = pgTable("office_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  notes: text("notes"),
  dueDate: date("due_date"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("todo"),
  category: text("category"),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOfficeTaskSchema = createInsertSchema(officeTasksTable).omit({ id: true, createdAt: true });
export type InsertOfficeTask = z.infer<typeof insertOfficeTaskSchema>;
export type OfficeTask = typeof officeTasksTable.$inferSelect;
