import { Router } from "express";
import { db, eblastsTable, gcalOrphansTable, todoistOrphansTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateEblastBody,
  UpdateEblastBody,
  CreateEblastParams,
  UpdateEblastParams,
  DeleteEblastParams,
  ListEblastsParams,
  BulkCreateEblastsBody,
  BulkCreateEblastsParams,
} from "@workspace/api-zod";

const router = Router({ mergeParams: true });

router.get("/", async (req, res): Promise<void> => {
  const params = ListEblastsParams.safeParse({ showId: Number(req.params.showId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid show ID" });
    return;
  }

  const eblasts = await db
    .select()
    .from(eblastsTable)
    .where(eq(eblastsTable.showId, params.data.showId))
    .orderBy(eblastsTable.createdAt);

  res.json(eblasts);
});

router.post("/", async (req, res): Promise<void> => {
  const params = CreateEblastParams.safeParse({ showId: Number(req.params.showId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid show ID" });
    return;
  }

  const parsed = CreateEblastBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [eblast] = await db
    .insert(eblastsTable)
    .values({ ...parsed.data, showId: params.data.showId })
    .returning();

  res.status(201).json(eblast);
});

router.post("/bulk", async (req, res): Promise<void> => {
  const params = BulkCreateEblastsParams.safeParse({ showId: Number(req.params.showId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid show ID" });
    return;
  }

  const parsed = BulkCreateEblastsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.eblasts.length === 0) {
    res.status(201).json([]);
    return;
  }

  const eblasts = await db
    .insert(eblastsTable)
    .values(parsed.data.eblasts.map((e) => ({ ...e, showId: params.data.showId })))
    .returning();

  res.status(201).json(eblasts);
});

router.put("/:eblastId", async (req, res): Promise<void> => {
  const params = UpdateEblastParams.safeParse({
    showId: Number(req.params.showId),
    eblastId: Number(req.params.eblastId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const body = { ...req.body };
  if (body.dueDate === "") body.dueDate = null;

  const parsed = UpdateEblastBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.sent === true) {
    updates.sentAt = parsed.data.sentAt ? new Date(parsed.data.sentAt) : new Date();
  } else if (parsed.data.sent === false) {
    updates.sentAt = null;
  } else if (parsed.data.sentAt !== undefined) {
    updates.sentAt = parsed.data.sentAt ? new Date(parsed.data.sentAt) : null;
  }

  const [eblast] = await db
    .update(eblastsTable)
    .set(updates)
    .where(
      and(
        eq(eblastsTable.id, params.data.eblastId),
        eq(eblastsTable.showId, params.data.showId)
      )
    )
    .returning();

  if (!eblast) {
    res.status(404).json({ error: "E-blast not found" });
    return;
  }

  res.json(eblast);
});

router.delete("/:eblastId", async (req, res): Promise<void> => {
  const params = DeleteEblastParams.safeParse({
    showId: Number(req.params.showId),
    eblastId: Number(req.params.eblastId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [eblast] = await db
    .select({ gcalEventId: eblastsTable.gcalEventId, todoistTaskId: eblastsTable.todoistTaskId })
    .from(eblastsTable)
    .where(and(eq(eblastsTable.id, params.data.eblastId), eq(eblastsTable.showId, params.data.showId)));

  if (eblast?.gcalEventId) {
    await db.insert(gcalOrphansTable).values({ gcalEventId: eblast.gcalEventId, calendarType: "eblast" });
  }
  if (eblast?.todoistTaskId) {
    await db.insert(todoistOrphansTable).values({ todoistTaskId: eblast.todoistTaskId, itemType: "eblast" });
  }

  await db
    .delete(eblastsTable)
    .where(
      and(
        eq(eblastsTable.id, params.data.eblastId),
        eq(eblastsTable.showId, params.data.showId)
      )
    );

  res.status(204).send();
});

export default router;
