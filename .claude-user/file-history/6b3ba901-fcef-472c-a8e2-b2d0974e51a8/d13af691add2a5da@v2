import { Router } from "express";
import { db, presetTasksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreatePresetTaskBody,
  UpdatePresetTaskBody,
  UpdatePresetTaskParams,
  DeletePresetTaskParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (_req, res): Promise<void> => {
  const presets = await db.select().from(presetTasksTable).orderBy(presetTasksTable.id);
  res.json(presets);
});

router.post("/", async (req, res): Promise<void> => {
  const body = { ...req.body };
  if (body.dueDateOffset === "") body.dueDateOffset = null;
  if (body.dueDateUnit === "") body.dueDateUnit = null;
  if (body.dueDateDirection === "") body.dueDateDirection = null;
  if (body.dueDateAnchor === "") body.dueDateAnchor = null;

  const parsed = CreatePresetTaskBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [preset] = await db.insert(presetTasksTable).values(parsed.data).returning();
  res.status(201).json(preset);
});

router.put("/:presetId", async (req, res): Promise<void> => {
  const params = UpdatePresetTaskParams.safeParse({ presetId: Number(req.params.presetId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid presetId" });
    return;
  }

  const body = { ...req.body };
  if (body.dueDateOffset === "") body.dueDateOffset = null;
  if (body.dueDateUnit === "") body.dueDateUnit = null;
  if (body.dueDateDirection === "") body.dueDateDirection = null;
  if (body.dueDateAnchor === "") body.dueDateAnchor = null;

  const parsed = UpdatePresetTaskBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(presetTasksTable).where(eq(presetTasksTable.id, params.data.presetId));
  if (existing.length === 0) {
    res.status(404).json({ error: "Preset task not found" });
    return;
  }

  const [updated] = await db.update(presetTasksTable)
    .set(parsed.data)
    .where(eq(presetTasksTable.id, params.data.presetId))
    .returning();

  res.json(updated);
});

router.delete("/:presetId", async (req, res): Promise<void> => {
  const params = DeletePresetTaskParams.safeParse({ presetId: Number(req.params.presetId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid presetId" });
    return;
  }

  const existing = await db.select().from(presetTasksTable).where(eq(presetTasksTable.id, params.data.presetId));
  if (existing.length === 0) {
    res.status(404).json({ error: "Preset task not found" });
    return;
  }

  await db.delete(presetTasksTable).where(eq(presetTasksTable.id, params.data.presetId));
  res.status(204).send();
});

export default router;
