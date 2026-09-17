import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import { db, showsTable, tasksTable, eblastsTable, todoistSyncEventsTable, todoistOrphansTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import showsRouter from "./shows";
import { enqueueSync } from "../lib/todoist-sync/outbox";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/shows", showsRouter);
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

describe("DELETE /shows/:showId", () => {
  it("fans out one Todoist delete sync event per mapped child task/e-blast, superseding any pending upsert event first, and writes no new todoist_orphans rows", async () => {
    const [show] = await db
      .insert(showsTable)
      .values({ name: "Outbox Show Delete Test", moveInDate: "2027-01-01" })
      .returning();

    const mappedTaskTodoistId = `TEST-TDST-SHOWDEL-TASK-${Date.now()}`;
    const mappedEblastTodoistId = `TEST-TDST-SHOWDEL-EBLAST-${Date.now()}`;

    const [mappedTask] = await db
      .insert(tasksTable)
      .values({ showId: show.id, name: "Mapped Task", dueDate: "2027-02-01", todoistTaskId: mappedTaskTodoistId })
      .returning();
    await db
      .insert(tasksTable)
      .values({ showId: show.id, name: "Unmapped Task", dueDate: "2027-02-01" });
    const [mappedEblast] = await db
      .insert(eblastsTable)
      .values({ showId: show.id, name: "Mapped Eblast", dueDate: "2027-02-01", todoistTaskId: mappedEblastTodoistId })
      .returning();

    // Seed an active upsert event for each mapped child, then simulate a worker having
    // claimed both (as if a drain worker were mid-delivery when this show delete arrives) —
    // this is what the show delete must supersede before enqueuing deletes.
    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: mappedTask.id, reason: "update" });
      await enqueueSync(tx, { itemType: "eblast", itemId: mappedEblast.id, reason: "update" });
    });
    await db
      .update(todoistSyncEventsTable)
      .set({
        status: "in_progress",
        claimToken: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        claimedAt: new Date(),
      })
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, mappedTask.id)));
    await db
      .update(todoistSyncEventsTable)
      .set({
        status: "in_progress",
        claimToken: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        claimedAt: new Date(),
      })
      .where(and(eq(todoistSyncEventsTable.itemType, "eblast"), eq(todoistSyncEventsTable.itemId, mappedEblast.id)));

    try {
      const res = await fetch(`${baseUrl}/shows/${show.id}`, { method: "DELETE" });
      expect(res.status).toBe(204);

      const taskUpsertEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, mappedTask.id)));
      expect(taskUpsertEvents).toHaveLength(1);
      expect(taskUpsertEvents[0].status).toBe("abandoned");
      expect(taskUpsertEvents[0].lastError).toBe("Superseded by local deletion");
      expect(taskUpsertEvents[0].claimToken).toBeNull();
      expect(taskUpsertEvents[0].claimedAt).toBeNull();
      expect(taskUpsertEvents[0].generation).toBe(1);

      const eblastUpsertEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "eblast"), eq(todoistSyncEventsTable.itemId, mappedEblast.id)));
      expect(eblastUpsertEvents).toHaveLength(1);
      expect(eblastUpsertEvents[0].status).toBe("abandoned");
      expect(eblastUpsertEvents[0].lastError).toBe("Superseded by local deletion");
      expect(eblastUpsertEvents[0].claimToken).toBeNull();
      expect(eblastUpsertEvents[0].claimedAt).toBeNull();
      expect(eblastUpsertEvents[0].generation).toBe(1);

      const taskDeleteEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(
          and(
            eq(todoistSyncEventsTable.itemType, "task"),
            eq(todoistSyncEventsTable.todoistTaskId, mappedTaskTodoistId),
            isNull(todoistSyncEventsTable.itemId),
          ),
        );
      expect(taskDeleteEvents).toHaveLength(1);
      expect(taskDeleteEvents[0].operation).toBe("delete");
      expect(taskDeleteEvents[0].status).toBe("pending");

      const eblastDeleteEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(
          and(
            eq(todoistSyncEventsTable.itemType, "eblast"),
            eq(todoistSyncEventsTable.todoistTaskId, mappedEblastTodoistId),
            isNull(todoistSyncEventsTable.itemId),
          ),
        );
      expect(eblastDeleteEvents).toHaveLength(1);
      expect(eblastDeleteEvents[0].operation).toBe("delete");
      expect(eblastDeleteEvents[0].status).toBe("pending");

      const taskOrphans = await db
        .select()
        .from(todoistOrphansTable)
        .where(eq(todoistOrphansTable.todoistTaskId, mappedTaskTodoistId));
      expect(taskOrphans).toHaveLength(0);

      const eblastOrphans = await db
        .select()
        .from(todoistOrphansTable)
        .where(eq(todoistOrphansTable.todoistTaskId, mappedEblastTodoistId));
      expect(eblastOrphans).toHaveLength(0);

      const showRow = await db.select().from(showsTable).where(eq(showsTable.id, show.id));
      expect(showRow).toHaveLength(0);

      const remainingTasks = await db.select().from(tasksTable).where(eq(tasksTable.showId, show.id));
      expect(remainingTasks).toHaveLength(0);
    } finally {
      // The show and its children are already gone via the route's own cascading
      // delete when the request succeeded; this is a safety net for a failed request.
      await db.delete(showsTable).where(eq(showsTable.id, show.id));
      await db
        .delete(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, mappedTask.id)));
      await db
        .delete(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "eblast"), eq(todoistSyncEventsTable.itemId, mappedEblast.id)));
      await db
        .delete(todoistSyncEventsTable)
        .where(
          and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.todoistTaskId, mappedTaskTodoistId)),
        );
      await db
        .delete(todoistSyncEventsTable)
        .where(
          and(
            eq(todoistSyncEventsTable.itemType, "eblast"),
            eq(todoistSyncEventsTable.todoistTaskId, mappedEblastTodoistId),
          ),
        );
    }
  });
});
