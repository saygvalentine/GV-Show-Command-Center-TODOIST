import { Router } from "express";
import { db, tasksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateTaskBody,
  UpdateTaskBody,
  CreateTaskParams,
  UpdateTaskParams,
  DeleteTaskParams,
  ListTasksParams,
  BulkCreateTasksBody,
  BulkCreateTasksParams,
} from "@workspace/api-zod";

const router = Router({ mergeParams: true });

router.get("/", async (req, res): Promise<void> => {
  const params = ListTasksParams.safeParse({ showId: Number(req.params.showId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid show ID" });
    return;
  }

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.showId, params.data.showId))
    .orderBy(tasksTable.createdAt);

  res.json(tasks);
});

router.post("/", async (req, res): Promise<void> => {
  const params = CreateTaskParams.safeParse({ showId: Number(req.params.showId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid show ID" });
    return;
  }

  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db
    .insert(tasksTable)
    .values({ ...parsed.data, showId: params.data.showId })
    .returning();

  res.status(201).json(task);
});

router.post("/bulk", async (req, res): Promise<void> => {
  const params = BulkCreateTasksParams.safeParse({ showId: Number(req.params.showId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid show ID" });
    return;
  }

  const parsed = BulkCreateTasksBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.tasks.length === 0) {
    res.status(201).json([]);
    return;
  }

  const tasks = await db
    .insert(tasksTable)
    .values(parsed.data.tasks.map((t) => ({ ...t, showId: params.data.showId })))
    .returning();

  res.status(201).json(tasks);
});

router.put("/:taskId", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse({
    showId: Number(req.params.showId),
    taskId: Number(req.params.taskId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const body = { ...req.body };
  if (body.dueDate === "") body.dueDate = null;
  if (body.category === "none" || body.category === "") body.category = null;

  const parsed = UpdateTaskBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.completed === true) {
    updates.completedAt = new Date();
  } else if (parsed.data.completed === false) {
    updates.completedAt = null;
  }

  const [task] = await db
    .update(tasksTable)
    .set(updates)
    .where(
      and(
        eq(tasksTable.id, params.data.taskId),
        eq(tasksTable.showId, params.data.showId)
      )
    )
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(task);
});

router.delete("/:taskId", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse({
    showId: Number(req.params.showId),
    taskId: Number(req.params.taskId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  await db
    .delete(tasksTable)
    .where(
      and(
        eq(tasksTable.id, params.data.taskId),
        eq(tasksTable.showId, params.data.showId)
      )
    );

  res.status(204).send();
});

export default router;
