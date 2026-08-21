import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const todoistOrphansTable = pgTable("todoist_orphans", {
  id: serial("id").primaryKey(),
  todoistTaskId: text("todoist_task_id").notNull(),
  itemType: text("item_type").notNull().default("task"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
