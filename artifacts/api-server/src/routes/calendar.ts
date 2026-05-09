import { Router } from "express";
import { db, showsTable, tasksTable, eblastsTable, officeTasksTable } from "@workspace/db";
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
    type: "task" | "eblast" | "movein" | "officetask";
    showId: number | null;
    showName: string | null;
    name: string;
    date: string;
    category: string | null;
    done: boolean;
    priority?: string | null;
    officeTaskId?: number | null;
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

  // Office tasks (only if no show filter)
  if (!showId) {
    const officeTasks = await db
      .select()
      .from(officeTasksTable)
      .where(
        and(
          gte(officeTasksTable.dueDate, startDate),
          lte(officeTasksTable.dueDate, endDate)
        )
      );

    for (const ot of officeTasks) {
      if (!ot.dueDate) continue;
      events.push({
        id: ot.id + 2000000,
        type: "officetask",
        showId: null,
        showName: null,
        name: ot.title,
        date: ot.dueDate,
        category: ot.category,
        done: ot.completed,
        priority: ot.priority,
        officeTaskId: ot.id,
      });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  res.json(events);
});

router.get("/show-dates", async (req, res): Promise<void> => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  const showId = req.query.showId ? Number(req.query.showId) : undefined;

  if (!month || !year) {
    res.status(400).json({ error: "month and year required" });
    return;
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  const shows = showId
    ? await db.select().from(showsTable).where(eq(showsTable.id, showId))
    : await db.select().from(showsTable);

  type ShowDateType = "movein" | "advwarehouse" | "discount" | "orderdeadline" | "showstart" | "dismantle" | "showday";
  const milestones: Array<{ field: keyof typeof shows[0]; type: ShowDateType; label: string }> = [
    { field: "moveInDate",           type: "movein",        label: "Move-In" },
    { field: "advanceWarehouseDate", type: "advwarehouse",  label: "Adv. Warehouse" },
    { field: "discountDeadline",     type: "discount",      label: "Discount Deadline" },
    { field: "onlineOrderDeadline",  type: "orderdeadline", label: "Online Order Deadline" },
    { field: "showStart",            type: "showstart",     label: "Show Start" },
    { field: "dismantleDate",        type: "dismantle",     label: "Dismantle" },
  ];

  const dateEvents: {
    id: number;
    type: ShowDateType;
    showId: number;
    showName: string;
    name: string;
    date: string;
  }[] = [];

  for (const show of shows) {
    milestones.forEach(({ field, type, label }, idx) => {
      const date = show[field] as string | null;
      if (date && date >= startDate && date <= endDate) {
        dateEvents.push({
          id: show.id * 100 + idx,
          type,
          showId: show.id,
          showName: show.name,
          name: `${show.name} — ${label}`,
          date,
        });
      }
    });
  }

  // Expand showStart → dismantleDate into per-day "showday" events for intermediate days
  for (const show of shows) {
    if (showId && show.id !== showId) continue;
    if (!show.showStart || !show.dismantleDate || show.showStart >= show.dismantleDate) continue;

    const cur = new Date(show.showStart + "T00:00:00Z");
    cur.setUTCDate(cur.getUTCDate() + 1); // skip showStart day (already a "showstart" milestone)
    let dayIdx = 0;
    while (true) {
      const dateStr = cur.toISOString().slice(0, 10);
      if (dateStr >= show.dismantleDate) break; // exclusive of dismantleDate
      if (dateStr >= startDate && dateStr <= endDate) {
        dateEvents.push({
          id: show.id * 10000 + dayIdx,
          type: "showday",
          showId: show.id,
          showName: show.name,
          name: show.name,
          date: dateStr,
        });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
      dayIdx++;
    }
  }

  dateEvents.sort((a, b) => a.date.localeCompare(b.date));
  res.json(dateEvents);
});

export default router;
