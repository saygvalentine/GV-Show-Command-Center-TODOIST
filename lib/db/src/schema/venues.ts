import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const venuesTable = pgTable("venues", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Venue = typeof venuesTable.$inferSelect;
