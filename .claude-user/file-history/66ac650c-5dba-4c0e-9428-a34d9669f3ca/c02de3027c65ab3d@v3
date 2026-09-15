import { Router } from "express";
import { db, showsTable, tasksTable, eblastsTable, todoistOrphansTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { todoistRequest, todoistListProjects } from "../lib/todoist-client";
import { deliverTask, deliverEblast } from "../lib/todoist-sync/delivery";
import { tallyOutcome, type SyncCounters } from "../lib/todoist-sync/types";

const router = Router();

async function drainOrphans(counters: { deleted: number }) {
  const orphans = await db.select().from(todoistOrphansTable);
  if (orphans.length === 0) return;

  const CONCURRENCY = 5;
  for (let i = 0; i < orphans.length; i += CONCURRENCY) {
    await Promise.all(
      orphans.slice(i, i + CONCURRENCY).map(async (orphan) => {
        await todoistRequest("DELETE", `/api/v1/tasks/${orphan.todoistTaskId}`);
        await db.delete(todoistOrphansTable).where(eq(todoistOrphansTable.id, orphan.id));
        counters.deleted++;
      }),
    );
  }
}

router.get("/projects", async (_req, res): Promise<void> => {
  try {
    const projects = await todoistListProjects();
    res.json({ projects });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

router.post("/sync", async (req, res): Promise<void> => {
  const taskProjectId = typeof req.query.taskProjectId === "string" ? req.query.taskProjectId : "";
  const eblastProjectId = typeof req.query.eblastProjectId === "string" ? req.query.eblastProjectId : "";

  const rawShowId = req.query.showId;
  let showId: number | undefined;
  if (rawShowId !== undefined) {
    const parsed = Number(rawShowId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ error: "Invalid showId — must be a positive integer" });
      return;
    }
    showId = parsed;
  }

  const shows = showId
    ? await db.select().from(showsTable).where(eq(showsTable.id, showId))
    : await db.select().from(showsTable);

  if (shows.length === 0 && showId !== undefined) {
    res.status(404).json({ error: "Show not found" });
    return;
  }

  const showIds = shows.map((s) => s.id);
  const showMap = new Map(shows.map((s) => [s.id, s.name]));

  const [allTasks, allEblasts] = await Promise.all([
    showIds.length > 0 ? db.select().from(tasksTable).where(inArray(tasksTable.showId, showIds)) : [],
    showIds.length > 0 ? db.select().from(eblastsTable).where(inArray(eblastsTable.showId, showIds)) : [],
  ]);

  const counters: SyncCounters = {
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    unlinked: 0,
    failed: 0,
  };

  const allWork = [
    ...allTasks.map((t) => async () => {
      const result = await deliverTask(t, showMap.get(t.showId) ?? "", taskProjectId);
      tallyOutcome(counters, result.outcome);
    }),
    ...allEblasts.map((e) => async () => {
      const result = await deliverEblast(e, showMap.get(e.showId) ?? "", eblastProjectId);
      tallyOutcome(counters, result.outcome);
    }),
  ];

  const CONCURRENCY = 5;
  try {
    for (let i = 0; i < allWork.length; i += CONCURRENCY) {
      await Promise.all(allWork.slice(i, i + CONCURRENCY).map((fn) => fn()));
    }
    await drainOrphans(counters);
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
    return;
  }

  res.json({ ok: true, ...counters });
});

export default router;
