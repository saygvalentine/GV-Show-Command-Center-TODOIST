import { Router } from "express";
import { db, officeTasksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListOfficeTasksQueryParams,
  CreateOfficeTaskBody,
  UpdateOfficeTaskBody,
  UpdateOfficeTaskParams,
  DeleteOfficeTaskParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res): Promise<void> => {
  const parsed = ListOfficeTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, priority, category } = parsed.data;

  const conditions = [];
  if (status) conditions.push(eq(officeTasksTable.status, status));
  if (priority) conditions.push(eq(officeTasksTable.priority, priority));
  if (category) conditions.push(eq(officeTasksTable.category, category));

  const tasks = conditions.length > 0
    ? await db.select().from(officeTasksTable).where(and(...conditions))
    : await db.select().from(officeTasksTable);

  res.json(tasks);
});

router.post("/", async (req, res): Promise<void> => {
  const body = { ...req.body };
  if (body.dueDate === "") body.dueDate = null;
  if (body.category === "") body.category = null;
  if (body.notes === "") body.notes = null;

  const parsed = CreateOfficeTaskBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const insertData: typeof officeTasksTable.$inferInsert = {
    title: data.title,
    notes: data.notes ?? null,
    dueDate: data.dueDate ?? null,
    priority: data.priority ?? "medium",
    status: data.status ?? "todo",
    category: data.category ?? null,
  };

  // Sync completed/completedAt with status
  if (insertData.status === "completed") {
    insertData.completed = true;
    insertData.completedAt = new Date();
  }

  const [task] = await db.insert(officeTasksTable).values(insertData).returning();
  res.status(201).json(task);
});

router.put("/:taskId", async (req, res): Promise<void> => {
  const params = UpdateOfficeTaskParams.safeParse({ taskId: Number(req.params.taskId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid taskId" });
    return;
  }

  const body = { ...req.body };
  if (body.dueDate === "") body.dueDate = null;
  if (body.category === "") body.category = null;
  if (body.notes === "") body.notes = null;

  const parsed = UpdateOfficeTaskBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(officeTasksTable).where(eq(officeTasksTable.id, params.data.taskId));
  if (existing.length === 0) {
    res.status(404).json({ error: "Office task not found" });
    return;
  }

  const updates: Record<string, unknown> = { ...parsed.data };

  // Sync completed <-> status consistency
  if (parsed.data.completed === true) {
    updates.completedAt = updates.completedAt ?? new Date();
    if (!parsed.data.status) updates.status = "completed";
  } else if (parsed.data.completed === false) {
    updates.completedAt = null;
    if (!parsed.data.status || parsed.data.status === "completed") {
      updates.status = existing[0].status === "completed" ? "todo" : existing[0].status;
    }
  }

  // If status is explicitly set to "completed", mark completed = true
  if (parsed.data.status === "completed" && parsed.data.completed !== false) {
    updates.completed = true;
    if (!updates.completedAt) updates.completedAt = existing[0].completedAt ?? new Date();
  }

  // If status is explicitly set to a non-completed status, mark completed = false
  if (parsed.data.status && parsed.data.status !== "completed" && parsed.data.completed !== true) {
    updates.completed = false;
    updates.completedAt = null;
  }

  const [updated] = await db.update(officeTasksTable)
    .set(updates)
    .where(eq(officeTasksTable.id, params.data.taskId))
    .returning();

  res.json(updated);
});

router.delete("/:taskId", async (req, res): Promise<void> => {
  const params = DeleteOfficeTaskParams.safeParse({ taskId: Number(req.params.taskId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid taskId" });
    return;
  }

  const existing = await db.select().from(officeTasksTable).where(eq(officeTasksTable.id, params.data.taskId));
  if (existing.length === 0) {
    res.status(404).json({ error: "Office task not found" });
    return;
  }

  await db.delete(officeTasksTable).where(eq(officeTasksTable.id, params.data.taskId));
  res.status(204).send();
});

export default router;
