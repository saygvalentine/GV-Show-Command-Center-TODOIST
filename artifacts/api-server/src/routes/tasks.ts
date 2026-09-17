import { Router } from "express";
import { db, tasksTable, gcalOrphansTable } from "@workspace/db";
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
import { enqueueSync, enqueueDelete, supersedeSync } from "../lib/todoist-sync/outbox";

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

  const task = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(tasksTable)
      .values({ ...parsed.data, showId: params.data.showId })
      .returning();

    await enqueueSync(tx, { itemType: "task", itemId: inserted.id, reason: "create" });

    return inserted;
  });

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

  const tasks = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(tasksTable)
      .values(parsed.data.tasks.map((t) => ({ ...t, showId: params.data.showId })))
      .returning();

    for (const task of inserted) {
      await enqueueSync(tx, { itemType: "task", itemId: task.id, reason: "create" });
    }

    return inserted;
  });

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
    updates.completedAt = parsed.data.completedAt ? new Date(parsed.data.completedAt) : new Date();
  } else if (parsed.data.completed === false) {
    updates.completedAt = null;
  } else if (parsed.data.completedAt !== undefined) {
    updates.completedAt = parsed.data.completedAt ? new Date(parsed.data.completedAt) : null;
  }

  const reason = parsed.data.completed === true ? "complete" : parsed.data.completed === false ? "reopen" : "update";

  const task = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasksTable)
      .set(updates)
      .where(
        and(
          eq(tasksTable.id, params.data.taskId),
          eq(tasksTable.showId, params.data.showId)
        )
      )
      .returning();

    if (!updated) return null;

    await enqueueSync(tx, { itemType: "task", itemId: updated.id, reason });

    return updated;
  });

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

  await db.transaction(async (tx) => {
    const [task] = await tx
      .select({ gcalEventId: tasksTable.gcalEventId, todoistTaskId: tasksTable.todoistTaskId })
      .from(tasksTable)
      .where(and(eq(tasksTable.id, params.data.taskId), eq(tasksTable.showId, params.data.showId)));

    if (task?.gcalEventId) {
      await tx.insert(gcalOrphansTable).values({ gcalEventId: task.gcalEventId, calendarType: "task" });
    }
    if (task?.todoistTaskId) {
      await supersedeSync(tx, { itemType: "task", itemId: params.data.taskId });
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: task.todoistTaskId, reason: "delete" });
    }

    await tx
      .delete(tasksTable)
      .where(
        and(
          eq(tasksTable.id, params.data.taskId),
          eq(tasksTable.showId, params.data.showId)
        )
      );
  });

  res.status(204).send();
});

export default router;
