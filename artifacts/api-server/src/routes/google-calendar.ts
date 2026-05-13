import { Router } from "express";
import { db, showsTable, tasksTable, eblastsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getGoogleCalendarToken, gcalRequest, makeGcalEvent } from "../lib/google-calendar-client";

const router = Router();

router.post("/sync", async (req, res): Promise<void> => {
  const showId = req.query.showId ? Number(req.query.showId) : undefined;

  let token: string;
  try {
    token = await getGoogleCalendarToken();
  } catch (err) {
    res.status(503).json({
      error: (err as Error).message,
    });
    return;
  }

  const shows = showId
    ? await db.select().from(showsTable).where(eq(showsTable.id, showId))
    : await db.select().from(showsTable);

  let created = 0;
  let updated = 0;
  let deleted = 0;

  for (const show of shows) {
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.showId, show.id));

    for (const task of tasks) {
      if (!task.dueDate) {
        if (task.gcalEventId) {
          await gcalRequest(token, "DELETE", `/calendars/primary/events/${task.gcalEventId}`);
          await db.update(tasksTable).set({ gcalEventId: null }).where(eq(tasksTable.id, task.id));
          deleted++;
        }
        continue;
      }

      const prefix = task.completed ? "✓ " : "";
      const summary = `${prefix}${task.name} [${show.name}]`;
      const descParts = [`Show: ${show.name}`];
      if (task.category) descParts.push(`Category: ${task.category}`);
      if (task.completed) descParts.push("Status: Completed");
      if (task.notes) descParts.push(`Notes: ${task.notes}`);
      const event = makeGcalEvent(summary, task.dueDate, descParts.join("\n"));

      if (task.gcalEventId) {
        const result = await gcalRequest(token, "PUT", `/calendars/primary/events/${task.gcalEventId}`, event);
        if (result === null) {
          const created_event = await gcalRequest(token, "POST", `/calendars/primary/events`, event) as { id: string } | null;
          if (created_event?.id) {
            await db.update(tasksTable).set({ gcalEventId: created_event.id }).where(eq(tasksTable.id, task.id));
          }
        }
        updated++;
      } else {
        const created_event = await gcalRequest(token, "POST", `/calendars/primary/events`, event) as { id: string } | null;
        if (created_event?.id) {
          await db.update(tasksTable).set({ gcalEventId: created_event.id }).where(eq(tasksTable.id, task.id));
        }
        created++;
      }
    }

    const eblasts = await db
      .select()
      .from(eblastsTable)
      .where(eq(eblastsTable.showId, show.id));

    for (const eblast of eblasts) {
      if (!eblast.dueDate) {
        if (eblast.gcalEventId) {
          await gcalRequest(token, "DELETE", `/calendars/primary/events/${eblast.gcalEventId}`);
          await db.update(eblastsTable).set({ gcalEventId: null }).where(eq(eblastsTable.id, eblast.id));
          deleted++;
        }
        continue;
      }

      const prefix = eblast.sent ? "✓ " : "";
      const summary = `${prefix}✉ ${eblast.name} [${show.name}]`;
      const descParts = [`Show: ${show.name}`, "Type: e-Blast"];
      if (eblast.sent) descParts.push("Status: Sent");
      if (eblast.notes) descParts.push(`Notes: ${eblast.notes}`);
      const event = makeGcalEvent(summary, eblast.dueDate, descParts.join("\n"));

      if (eblast.gcalEventId) {
        const result = await gcalRequest(token, "PUT", `/calendars/primary/events/${eblast.gcalEventId}`, event);
        if (result === null) {
          const created_event = await gcalRequest(token, "POST", `/calendars/primary/events`, event) as { id: string } | null;
          if (created_event?.id) {
            await db.update(eblastsTable).set({ gcalEventId: created_event.id }).where(eq(eblastsTable.id, eblast.id));
          }
        }
        updated++;
      } else {
        const created_event = await gcalRequest(token, "POST", `/calendars/primary/events`, event) as { id: string } | null;
        if (created_event?.id) {
          await db.update(eblastsTable).set({ gcalEventId: created_event.id }).where(eq(eblastsTable.id, eblast.id));
        }
        created++;
      }
    }
  }

  res.json({ ok: true, created, updated, deleted });
});

export default router;
