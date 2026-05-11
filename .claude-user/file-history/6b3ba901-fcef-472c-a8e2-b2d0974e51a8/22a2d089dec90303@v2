import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const presetTasksTable = pgTable("preset_tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  dueDateOffset: integer("due_date_offset"),
  dueDateUnit: text("due_date_unit"),
  dueDateDirection: text("due_date_direction"),
  dueDateAnchor: text("due_date_anchor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPresetTaskSchema = createInsertSchema(presetTasksTable).omit({ id: true, createdAt: true });
export type InsertPresetTask = z.infer<typeof insertPresetTaskSchema>;
export type PresetTask = typeof presetTasksTable.$inferSelect;
