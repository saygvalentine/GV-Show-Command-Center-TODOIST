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

  // Full-document replacement, not a partial patch: both fields are always present
  // in a validated body (required by the schema), so this writes exactly what the
  // caller sent with no server-side read-merge step. That read-merge is what caused
  // a lost-update race when two saves landed close together — each request read the
  // same stale row and could overwrite the other's just-written field. The caller
  // (TodoistProvider) is responsible for including the other field's current value.
  const next = {
    taskProjectId: parsed.data.taskProjectId,
    eblastProjectId: parsed.data.eblastProjectId,
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
