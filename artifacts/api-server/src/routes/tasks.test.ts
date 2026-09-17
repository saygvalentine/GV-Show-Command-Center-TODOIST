import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import { db, showsTable, tasksTable, todoistSyncEventsTable, todoistOrphansTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import tasksRouter from "./tasks";
import { enqueueSync } from "../lib/todoist-sync/outbox";

// Real HTTP server over the actual dev database (no Todoist/network calls are ever
// reachable from these routes in Phase 3A.1 — there is no drain worker yet). Mirrors
// the `/shows/:showId/tasks` mount point from routes/index.ts without the `/api` prefix.
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/shows/:showId/tasks", tasksRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

async function createTestShow(): Promise<number> {
  const [show] = await db
    .insert(showsTable)
    .values({ name: "Outbox Task Route Test Show", moveInDate: "2027-01-01" })
    .returning();
  return show.id;
}

async function cleanupShowAndEvents(showId: number, taskIds: number[] = [], todoistTaskIds: string[] = []) {
  await db.delete(showsTable).where(eq(showsTable.id, showId)); // cascades tasks
  for (const taskId of taskIds) {
    await db
      .delete(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, taskId)));
  }
  for (const todoistTaskId of todoistTaskIds) {
    await db
      .delete(todoistSyncEventsTable)
      .where(
        and(
          eq(todoistSyncEventsTable.itemType, "task"),
          eq(todoistSyncEventsTable.todoistTaskId, todoistTaskId),
          isNull(todoistSyncEventsTable.itemId),
        ),
      );
  }
}

describe("POST /shows/:showId/tasks", () => {
  it("creates the task and enqueues exactly one create sync event", async () => {
    const showId = await createTestShow();
    let taskId: number | undefined;
    try {
      const res = await fetch(`${baseUrl}/shows/${showId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Task", dueDate: "2027-02-01" }),
      });
      expect(res.status).toBe(201);
      const task = (await res.json()) as { id: number };
      taskId = task.id;

      const events = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, task.id)));

      expect(events).toHaveLength(1);
      expect(events[0].operation).toBe("upsert");
      expect(events[0].reason).toBe("create");
      expect(events[0].status).toBe("pending");
      expect(events[0].generation).toBe(1);
    } finally {
      await cleanupShowAndEvents(showId, taskId ? [taskId] : []);
    }
  });
});

describe("PUT /shows/:showId/tasks/:taskId", () => {
  it("repeated edits to the same task coalesce onto one active event carrying the latest reason", async () => {
    const showId = await createTestShow();
    const [task] = await db
      .insert(tasksTable)
      .values({ showId, name: "Edit Me", dueDate: "2027-02-01" })
      .returning();

    try {
      const res1 = await fetch(`${baseUrl}/shows/${showId}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "first edit" }),
      });
      expect(res1.status).toBe(200);

      const res2 = await fetch(`${baseUrl}/shows/${showId}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
      expect(res2.status).toBe(200);

      const events = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, task.id)));

      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe("complete");
      // First PUT creates the row (generation 1); second PUT coalesces (generation 2).
      expect(events[0].generation).toBe(2);
    } finally {
      await cleanupShowAndEvents(showId, [task.id]);
    }
  });

  it("reopening a completed task enqueues a reopen reason", async () => {
    const showId = await createTestShow();
    const [task] = await db
      .insert(tasksTable)
      .values({ showId, name: "Reopen Me", dueDate: "2027-02-01", completed: true, completedAt: new Date() })
      .returning();

    try {
      const res = await fetch(`${baseUrl}/shows/${showId}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: false }),
      });
      expect(res.status).toBe(200);

      const events = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, task.id)));

      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe("reopen");
    } finally {
      await cleanupShowAndEvents(showId, [task.id]);
    }
  });

  it("a failed update (unknown task) enqueues nothing", async () => {
    const showId = await createTestShow();
    try {
      const res = await fetch(`${baseUrl}/shows/${showId}/tasks/999999999`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "no such task" }),
      });
      expect(res.status).toBe(404);

      const events = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, 999999999)));

      expect(events).toHaveLength(0);
    } finally {
      await cleanupShowAndEvents(showId);
    }
  });
});

describe("DELETE /shows/:showId/tasks/:taskId", () => {
  it("enqueues a delete sync event for a mapped task and writes no new todoist_orphans row", async () => {
    const showId = await createTestShow();
    const todoistTaskId = `TEST-TDST-TASKDEL-${Date.now()}`;
    const [task] = await db
      .insert(tasksTable)
      .values({ showId, name: "Delete Me", dueDate: "2027-02-01", todoistTaskId })
      .returning();

    try {
      const orphansBefore = await db
        .select()
        .from(todoistOrphansTable)
        .where(eq(todoistOrphansTable.todoistTaskId, todoistTaskId));
      expect(orphansBefore).toHaveLength(0);

      const res = await fetch(`${baseUrl}/shows/${showId}/tasks/${task.id}`, { method: "DELETE" });
      expect(res.status).toBe(204);

      const deleteEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(
          and(
            eq(todoistSyncEventsTable.itemType, "task"),
            eq(todoistSyncEventsTable.todoistTaskId, todoistTaskId),
            isNull(todoistSyncEventsTable.itemId),
          ),
        );
      expect(deleteEvents).toHaveLength(1);
      expect(deleteEvents[0].operation).toBe("delete");
      expect(deleteEvents[0].status).toBe("pending");

      const orphansAfter = await db
        .select()
        .from(todoistOrphansTable)
        .where(eq(todoistOrphansTable.todoistTaskId, todoistTaskId));
      expect(orphansAfter).toHaveLength(0);

      const remainingTask = await db.select().from(tasksTable).where(eq(tasksTable.id, task.id));
      expect(remainingTask).toHaveLength(0);
    } finally {
      await cleanupShowAndEvents(showId, [], [todoistTaskId]);
    }
  });

  it("supersedes a pending active sync event before enqueuing the delete", async () => {
    const showId = await createTestShow();
    const todoistTaskId = `TEST-TDST-TASKDEL-SUPERSEDE-${Date.now()}`;
    const [task] = await db
      .insert(tasksTable)
      .values({ showId, name: "Delete Me With Pending Sync", dueDate: "2027-02-01", todoistTaskId })
      .returning();

    try {
      // Seed an active upsert event, as if a prior edit hadn't drained yet.
      await db.transaction(async (tx) => {
        await enqueueSync(tx, { itemType: "task", itemId: task.id, reason: "update" });
      });

      const res = await fetch(`${baseUrl}/shows/${showId}/tasks/${task.id}`, { method: "DELETE" });
      expect(res.status).toBe(204);

      const upsertEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, task.id)));
      expect(upsertEvents).toHaveLength(1);
      expect(upsertEvents[0].status).toBe("abandoned");
      expect(upsertEvents[0].lastError).toBe("Superseded by local deletion");

      const activeUpsertEvents = upsertEvents.filter((e) => e.status === "pending" || e.status === "in_progress");
      expect(activeUpsertEvents).toHaveLength(0);

      const deleteEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(
          and(
            eq(todoistSyncEventsTable.itemType, "task"),
            eq(todoistSyncEventsTable.todoistTaskId, todoistTaskId),
            isNull(todoistSyncEventsTable.itemId),
          ),
        );
      expect(deleteEvents).toHaveLength(1);
      expect(deleteEvents[0].status).toBe("pending");
    } finally {
      await cleanupShowAndEvents(showId, [task.id], [todoistTaskId]);
    }
  });

  it("supersedes an in_progress mapped sync event with a held claim token before enqueuing the delete", async () => {
    const showId = await createTestShow();
    const todoistTaskId = `TEST-TDST-TASKDEL-CLAIMED-${Date.now()}`;
    const [task] = await db
      .insert(tasksTable)
      .values({ showId, name: "Delete Me With Claimed Sync", dueDate: "2027-02-01", todoistTaskId })
      .returning();

    try {
      // Seed an active upsert event, then simulate a worker having claimed it
      // (as if a drain worker were mid-delivery when this delete arrives).
      await db.transaction(async (tx) => {
        await enqueueSync(tx, { itemType: "task", itemId: task.id, reason: "update" });
      });
      await db
        .update(todoistSyncEventsTable)
        .set({
          status: "in_progress",
          claimToken: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          claimedAt: new Date(),
        })
        .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, task.id)));

      const res = await fetch(`${baseUrl}/shows/${showId}/tasks/${task.id}`, { method: "DELETE" });
      expect(res.status).toBe(204);

      const upsertEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, task.id)));
      expect(upsertEvents).toHaveLength(1);
      expect(upsertEvents[0].status).toBe("abandoned");
      expect(upsertEvents[0].lastError).toBe("Superseded by local deletion");
      expect(upsertEvents[0].claimToken).toBeNull();
      expect(upsertEvents[0].claimedAt).toBeNull();
      // Superseding is terminal — generation is historical record, not reset.
      expect(upsertEvents[0].generation).toBe(1);

      const deleteEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(
          and(
            eq(todoistSyncEventsTable.itemType, "task"),
            eq(todoistSyncEventsTable.todoistTaskId, todoistTaskId),
            isNull(todoistSyncEventsTable.itemId),
          ),
        );
      expect(deleteEvents).toHaveLength(1);
      expect(deleteEvents[0].status).toBe("pending");
    } finally {
      await cleanupShowAndEvents(showId, [task.id], [todoistTaskId]);
    }
  });

  it("deleting an unmapped task enqueues no delete event", async () => {
    const showId = await createTestShow();
    const [task] = await db
      .insert(tasksTable)
      .values({ showId, name: "Delete Me Unmapped", dueDate: "2027-02-01" })
      .returning();

    try {
      const res = await fetch(`${baseUrl}/shows/${showId}/tasks/${task.id}`, { method: "DELETE" });
      expect(res.status).toBe(204);

      const events = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, task.id)));
      expect(events).toHaveLength(0);
    } finally {
      await cleanupShowAndEvents(showId, [task.id]);
    }
  });
});
