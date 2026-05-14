import { Router } from "express";
import { db, showsTable, tasksTable, eblastsTable, gcalOrphansTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { gcalRequest, makeGcalEvent } from "../lib/google-calendar-client";

const router = Router();

type GcalEvent = { id: string };

async function syncTask(
  task: typeof tasksTable.$inferSelect,
  showName: string,
  token: string,
  calendarId: string,
  counters: { created: number; updated: number; deleted: number },
) {
  if (!task.dueDate) {
    if (task.gcalEventId) {
      await gcalRequest("DELETE", `/calendars/primary/events/${task.gcalEventId}`, token, calendarId);
      await db.update(tasksTable).set({ gcalEventId: null }).where(eq(tasksTable.id, task.id));
      counters.deleted++;
    }
    return;
  }

  const prefix = task.completed ? "✓ " : "";
  const summary = `${prefix}${task.name} [${showName}]`;
  const descParts = [`Show: ${showName}`];
  if (task.category) descParts.push(`Category: ${task.category}`);
  if (task.completed) descParts.push("Status: Completed");
  if (task.notes) descParts.push(`Notes: ${task.notes}`);
  const event = makeGcalEvent(summary, task.dueDate, descParts.join("\n"));

  if (task.gcalEventId) {
    const result = await gcalRequest("PUT", `/calendars/primary/events/${task.gcalEventId}`, token, calendarId, event);
    if (result === null) {
      const created = await gcalRequest("POST", `/calendars/primary/events`, token, calendarId, event) as GcalEvent | null;
      if (created?.id) {
        await db.update(tasksTable).set({ gcalEventId: created.id }).where(eq(tasksTable.id, task.id));
      }
      counters.created++;
    } else {
      counters.updated++;
    }
  } else {
    const created = await gcalRequest("POST", `/calendars/primary/events`, token, calendarId, event) as GcalEvent | null;
    if (created?.id) {
      await db.update(tasksTable).set({ gcalEventId: created.id }).where(eq(tasksTable.id, task.id));
    }
    counters.created++;
  }
}

async function syncEblast(
  eblast: typeof eblastsTable.$inferSelect,
  showName: string,
  token: string,
  calendarId: string,
  counters: { created: number; updated: number; deleted: number },
) {
  if (!eblast.dueDate) {
    if (eblast.gcalEventId) {
      await gcalRequest("DELETE", `/calendars/primary/events/${eblast.gcalEventId}`, token, calendarId);
      await db.update(eblastsTable).set({ gcalEventId: null }).where(eq(eblastsTable.id, eblast.id));
      counters.deleted++;
    }
    return;
  }

  const prefix = eblast.sent ? "✓ " : "";
  const summary = `${prefix}✉ ${eblast.name} [${showName}]`;
  const descParts = [`Show: ${showName}`, "Type: e-Blast"];
  if (eblast.sent) descParts.push("Status: Sent");
  if (eblast.notes) descParts.push(`Notes: ${eblast.notes}`);
  const event = makeGcalEvent(summary, eblast.dueDate, descParts.join("\n"));

  if (eblast.gcalEventId) {
    const result = await gcalRequest("PUT", `/calendars/primary/events/${eblast.gcalEventId}`, token, calendarId, event);
    if (result === null) {
      const created = await gcalRequest("POST", `/calendars/primary/events`, token, calendarId, event) as GcalEvent | null;
      if (created?.id) {
        await db.update(eblastsTable).set({ gcalEventId: created.id }).where(eq(eblastsTable.id, eblast.id));
      }
      counters.created++;
    } else {
      counters.updated++;
    }
  } else {
    const created = await gcalRequest("POST", `/calendars/primary/events`, token, calendarId, event) as GcalEvent | null;
    if (created?.id) {
      await db.update(eblastsTable).set({ gcalEventId: created.id }).where(eq(eblastsTable.id, eblast.id));
    }
    counters.created++;
  }
}

async function drainOrphans(token: string, calendarId: string, counters: { deleted: number }) {
  const orphans = await db.select().from(gcalOrphansTable);
  if (orphans.length === 0) return;

  const CONCURRENCY = 5;
  for (let i = 0; i < orphans.length; i += CONCURRENCY) {
    await Promise.all(
      orphans.slice(i, i + CONCURRENCY).map(async (orphan) => {
        await gcalRequest("DELETE", `/calendars/primary/events/${orphan.gcalEventId}`, token, calendarId);
        await db.delete(gcalOrphansTable).where(eq(gcalOrphansTable.id, orphan.id));
        counters.deleted++;
      }),
    );
  }
}

router.post("/sync", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header — connect Google Calendar in Settings first" });
    return;
  }
  const token = authHeader.slice(7);

  const rawCalendarId = req.query.calendarId;
  if (!rawCalendarId || typeof rawCalendarId !== "string") {
    res.status(400).json({ error: "calendarId query param is required" });
    return;
  }
  const calendarId = rawCalendarId;

  const rawShowId = req.query.showId;
  let showId: number | undefined;
  if (rawShowId !== undefined) {
    const parsed = Number(rawShowId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ error: "Invalid showId — must be a positive integer" });
      return;
    }
    showId = parsed;
  }

  const shows = showId
    ? await db.select().from(showsTable).where(eq(showsTable.id, showId))
    : await db.select().from(showsTable);

  if (shows.length === 0 && showId !== undefined) {
    res.status(404).json({ error: "Show not found" });
    return;
  }

  const showIds = shows.map((s) => s.id);
  const showMap = new Map(shows.map((s) => [s.id, s.name]));

  const [allTasks, allEblasts] = await Promise.all([
    showIds.length > 0
      ? db.select().from(tasksTable).where(inArray(tasksTable.showId, showIds))
      : [],
    showIds.length > 0
      ? db.select().from(eblastsTable).where(inArray(eblastsTable.showId, showIds))
      : [],
  ]);

  const counters = { created: 0, updated: 0, deleted: 0 };

  const allWork = [
    ...allTasks.map((t) => () => syncTask(t, showMap.get(t.showId) ?? "", token, calendarId, counters)),
    ...allEblasts.map((e) => () => syncEblast(e, showMap.get(e.showId) ?? "", token, calendarId, counters)),
  ];

  const CONCURRENCY = 5;
  try {
    for (let i = 0; i < allWork.length; i += CONCURRENCY) {
      await Promise.all(allWork.slice(i, i + CONCURRENCY).map((fn) => fn()));
    }
    await drainOrphans(token, calendarId, counters);
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
    return;
  }

  res.json({ ok: true, ...counters });
});

export default router;
