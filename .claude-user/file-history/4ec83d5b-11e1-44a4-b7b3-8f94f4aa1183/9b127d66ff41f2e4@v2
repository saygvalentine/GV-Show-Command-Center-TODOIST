import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Server-side replacement for the browser-local `todoist_prefs` localStorage key.
// The app has no user/auth/workspace model, so this is a singleton row — but it is
// keyed by a text id (rather than a bare one-row table) so an ownership scope can be
// introduced later without renumbering or restructuring.
export const TODOIST_SETTINGS_ID = "default";

export const todoistSettingsTable = pgTable("todoist_settings", {
  id: text("id").primaryKey().default(TODOIST_SETTINGS_ID),
  taskProjectId: text("task_project_id"),
  eblastProjectId: text("eblast_project_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
