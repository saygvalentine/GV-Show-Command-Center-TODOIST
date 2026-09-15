import { Router } from "express";
import { db, todoistSettingsTable, TODOIST_SETTINGS_ID } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateTodoistSettingsBody } from "@workspace/api-zod";

const router = Router();

interface TodoistSettingsResponse {
  taskProjectId: string | null;
  eblastProjectId: string | null;
}

// Before any settings have been saved there is simply no row — callers get the same
// shape they would after clearing both pickers, so the frontend needs no special case.
const EMPTY_SETTINGS: TodoistSettingsResponse = {
  taskProjectId: null,
  eblastProjectId: null,
};

async function readSettings(): Promise<TodoistSettingsResponse> {
  const [row] = await db
    .select()
    .from(todoistSettingsTable)
    .where(eq(todoistSettingsTable.id, TODOIST_SETTINGS_ID));

  if (!row) return EMPTY_SETTINGS;

  return {
    taskProjectId: row.taskProjectId ?? null,
    eblastProjectId: row.eblastProjectId ?? null,
  };
}

router.get("/", async (_req, res): Promise<void> => {
  res.json(await readSettings());
});

router.put("/", async (req, res): Promise<void> => {
  // The Settings pickers submit "" for "no project selected" (Todoist's Inbox default),
  // matching the empty-string normalization the tasks/preset-tasks routes already do.
  const body = { ...req.body };
  if (body.taskProjectId === "") body.taskProjectId = null;
  if (body.eblastProjectId === "") body.eblastProjectId = null;

  const parsed = UpdateTodoistSettingsBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Partial update: an omitted field keeps its stored value, an explicit null clears it.
  const current = await readSettings();
  const next = {
    taskProjectId:
      parsed.data.taskProjectId !== undefined
        ? parsed.data.taskProjectId ?? null
        : current.taskProjectId,
    eblastProjectId:
      parsed.data.eblastProjectId !== undefined
        ? parsed.data.eblastProjectId ?? null
        : current.eblastProjectId,
  };

  const [row] = await db
    .insert(todoistSettingsTable)
    .values({ id: TODOIST_SETTINGS_ID, ...next })
    .onConflictDoUpdate({
      target: todoistSettingsTable.id,
      set: { ...next, updatedAt: new Date() },
    })
    .returning();

  res.json({
    taskProjectId: row?.taskProjectId ?? null,
    eblastProjectId: row?.eblastProjectId ?? null,
  });
});

export default router;
