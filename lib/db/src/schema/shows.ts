import { pgTable, text, serial, timestamp, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const showsTable = pgTable("shows", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  moveInDate: date("move_in_date").notNull(),
  venue: text("venue"),
  advanceWarehouseDate: date("advance_warehouse_date"),
  discountDeadline: date("discount_deadline"),
  onlineOrderDeadline: date("online_order_deadline"),
  showStart: date("show_start"),
  dismantleDate: date("dismantle_date"),
  tags: text("tags").array().notNull().default(sql`'{}'`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertShowSchema = createInsertSchema(showsTable).omit({ id: true, createdAt: true });
export type InsertShow = z.infer<typeof insertShowSchema>;
export type Show = typeof showsTable.$inferSelect;
