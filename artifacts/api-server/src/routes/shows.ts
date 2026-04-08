import { Router } from "express";
import { db, showsTable, tasksTable, eblastsTable, linksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateShowBody,
  UpdateShowBody,
  GetShowParams,
  UpdateShowParams,
  DeleteShowParams,
} from "@workspace/api-zod";

const router = Router();

const DATE_FIELDS = [
  "moveInDate",
  "advanceWarehouseDate",
  "discountDeadline",
  "onlineOrderDeadline",
  "showStart",
  "dismantleDate",
] as const;

function sanitizeDates(body: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...body };
  for (const field of DATE_FIELDS) {
    if (sanitized[field] === "" || sanitized[field] === undefined) {
      sanitized[field] = null;
    }
  }
  return sanitized;
}

function toDateStr(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().split("T")[0];
}

function computeShowStats(
  show: typeof showsTable.$inferSelect,
  tasks: (typeof tasksTable.$inferSelect)[],
  eblasts: (typeof eblastsTable.$inferSelect)[]
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const overdueTasks = tasks.filter(
    (t) => !t.completed && t.dueDate && t.dueDate < todayStr
  );
  const overdueEblasts = eblasts.filter(
    (e) => !e.sent && e.dueDate && e.dueDate < todayStr
  );

  const sentEblasts = eblasts.filter((e) => e.sent).sort((a, b) => {
    if (!a.sentAt || !b.sentAt) return 0;
    return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
  });

  const lastEblast = sentEblasts[0];
  const oldestEblast = sentEblasts[sentEblasts.length - 1];

  // Fire Marshal status
  const fireMarshalTasks = tasks.filter((t) => t.category === "Fire Marshal / Floor Plan");
  let fireMarshalStatus: string | null = null;
  let fireMarshalDate: string | null = null;
  if (fireMarshalTasks.length > 0) {
    const allDone = fireMarshalTasks.every((t) => t.completed);
    if (allDone) {
      fireMarshalStatus = "Submitted";
      const lastDone = fireMarshalTasks
        .filter((t) => t.completedAt)
        .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];
      fireMarshalDate = lastDone?.completedAt?.toISOString() ?? null;
    } else {
      fireMarshalStatus = "In Progress";
    }
  }

  // ID Sign status
  const idSignTasks = tasks.filter((t) => t.category === "ID Sign Production");
  let idSignStatus: string | null = null;
  if (idSignTasks.length > 0) {
    const allDone = idSignTasks.every((t) => t.completed);
    idSignStatus = allDone ? "Ordered" : "In Progress";
  }

  return {
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((t) => t.completed).length,
    eblastCount: eblasts.length,
    sentEblastCount: sentEblasts.length,
    overdueCount: overdueTasks.length + overdueEblasts.length,
    lastEblastDate: lastEblast?.sentAt?.toISOString() ?? null,
    exhibitorKitSent: sentEblasts.length > 0,
    exhibitorKitDate: oldestEblast?.sentAt?.toISOString() ?? null,
    fireMarshalStatus,
    fireMarshalDate,
    idSignStatus,
  };
}

router.get("/", async (req, res): Promise<void> => {
  const shows = await db.select().from(showsTable).orderBy(showsTable.moveInDate);
  const allTasks = await db.select().from(tasksTable);
  const allEblasts = await db.select().from(eblastsTable);

  const result = shows.map((show) => {
    const tasks = allTasks.filter((t) => t.showId === show.id);
    const eblasts = allEblasts.filter((e) => e.showId === show.id);
    return { ...show, ...computeShowStats(show, tasks, eblasts) };
  });

  res.json(result);
});

router.post("/", async (req, res): Promise<void> => {
  const parsed = CreateShowBody.safeParse(sanitizeDates(req.body));
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const values = {
    name: parsed.data.name,
    moveInDate: toDateStr(parsed.data.moveInDate)!,
    venue: parsed.data.venue ?? null,
    advanceWarehouseDate: toDateStr(parsed.data.advanceWarehouseDate),
    discountDeadline: toDateStr(parsed.data.discountDeadline),
    onlineOrderDeadline: toDateStr(parsed.data.onlineOrderDeadline),
    showStart: toDateStr(parsed.data.showStart),
    dismantleDate: toDateStr(parsed.data.dismantleDate),
  };

  const [show] = await db.insert(showsTable).values(values).returning();
  res.status(201).json({ ...show, taskCount: 0, completedTaskCount: 0, eblastCount: 0, sentEblastCount: 0, overdueCount: 0, lastEblastName: null, lastEblastDate: null, exhibitorKitSent: false, exhibitorKitDate: null, fireMarshalStatus: null, fireMarshalDate: null, idSignStatus: null });
});

router.get("/:showId", async (req, res): Promise<void> => {
  const params = GetShowParams.safeParse({ showId: Number(req.params.showId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid show ID" });
    return;
  }

  const [show] = await db.select().from(showsTable).where(eq(showsTable.id, params.data.showId));
  if (!show) {
    res.status(404).json({ error: "Show not found" });
    return;
  }

  const tasks = await db.select().from(tasksTable).where(eq(tasksTable.showId, show.id));
  const eblasts = await db.select().from(eblastsTable).where(eq(eblastsTable.showId, show.id));
  const links = await db.select().from(linksTable).where(eq(linksTable.showId, show.id));

  res.json({ ...show, ...computeShowStats(show, tasks, eblasts), tasks, eblasts, links });
});

router.put("/:showId", async (req, res): Promise<void> => {
  const params = UpdateShowParams.safeParse({ showId: Number(req.params.showId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid show ID" });
    return;
  }

  const parsed = UpdateShowBody.safeParse(sanitizeDates(req.body));
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const values = {
    name: parsed.data.name,
    moveInDate: toDateStr(parsed.data.moveInDate)!,
    venue: parsed.data.venue ?? null,
    advanceWarehouseDate: toDateStr(parsed.data.advanceWarehouseDate),
    discountDeadline: toDateStr(parsed.data.discountDeadline),
    onlineOrderDeadline: toDateStr(parsed.data.onlineOrderDeadline),
    showStart: toDateStr(parsed.data.showStart),
    dismantleDate: toDateStr(parsed.data.dismantleDate),
  };

  const [show] = await db
    .update(showsTable)
    .set(values)
    .where(eq(showsTable.id, params.data.showId))
    .returning();

  if (!show) {
    res.status(404).json({ error: "Show not found" });
    return;
  }

  const tasks = await db.select().from(tasksTable).where(eq(tasksTable.showId, show.id));
  const eblasts = await db.select().from(eblastsTable).where(eq(eblastsTable.showId, show.id));

  res.json({ ...show, ...computeShowStats(show, tasks, eblasts) });
});

router.delete("/:showId", async (req, res): Promise<void> => {
  const params = DeleteShowParams.safeParse({ showId: Number(req.params.showId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid show ID" });
    return;
  }

  await db.delete(showsTable).where(eq(showsTable.id, params.data.showId));
  res.status(204).send();
});

export default router;
