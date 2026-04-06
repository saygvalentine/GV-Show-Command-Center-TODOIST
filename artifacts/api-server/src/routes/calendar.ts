import { Router } from "express";
import { db, showsTable, tasksTable, eblastsTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { GetCalendarEventsQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res): Promise<void> => {
  const parsed = GetCalendarEventsQueryParams.safeParse({
    month: Number(req.query.month),
    year: Number(req.query.year),
    showId: req.query.showId ? Number(req.query.showId) : undefined,
  });

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { month, year, showId } = parsed.data;

  // month is 1-based
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  const shows = await db.select().from(showsTable);
  const events: {
    id: number;
    type: "task" | "eblast" | "movein";
    showId: number;
    showName: string;
    name: string;
    date: string;
    category: string | null;
    done: boolean;
  }[] = [];

  for (const show of shows) {
    if (showId && show.id !== showId) continue;

    // Move-in date event
    if (show.moveInDate >= startDate && show.moveInDate <= endDate) {
      events.push({
        id: show.id * 10000,
        type: "movein",
        showId: show.id,
        showName: show.name,
        name: `${show.name} Move-In`,
        date: show.moveInDate,
        category: null,
        done: false,
      });
    }

    // Tasks
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.showId, show.id),
          gte(tasksTable.dueDate, startDate),
          lte(tasksTable.dueDate, endDate)
        )
      );

    for (const task of tasks) {
      if (!task.dueDate) continue;
      events.push({
        id: task.id,
        type: "task",
        showId: show.id,
        showName: show.name,
        name: task.name,
        date: task.dueDate,
        category: task.category,
        done: task.completed,
      });
    }

    // E-blasts
    const eblasts = await db
      .select()
      .from(eblastsTable)
      .where(
        and(
          eq(eblastsTable.showId, show.id),
          gte(eblastsTable.dueDate, startDate),
          lte(eblastsTable.dueDate, endDate)
        )
      );

    for (const eblast of eblasts) {
      if (!eblast.dueDate) continue;
      events.push({
        id: eblast.id + 1000000,
        type: "eblast",
        showId: show.id,
        showName: show.name,
        name: eblast.name,
        date: eblast.dueDate,
        category: null,
        done: eblast.sent,
      });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  res.json(events);
});

export default router;
