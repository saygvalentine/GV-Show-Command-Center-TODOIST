import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import { db, showsTable, eblastsTable, todoistSyncEventsTable, todoistOrphansTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import eblastsRouter from "./eblasts";
import { enqueueSync } from "../lib/todoist-sync/outbox";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/shows/:showId/eblasts", eblastsRouter);
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
    .values({ name: "Outbox Eblast Route Test Show", moveInDate: "2027-01-01" })
    .returning();
  return show.id;
}

async function cleanupShowAndEvents(showId: number, eblastIds: number[] = [], todoistTaskIds: string[] = []) {
  await db.delete(showsTable).where(eq(showsTable.id, showId)); // cascades eblasts
  for (const eblastId of eblastIds) {
    await db
      .delete(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "eblast"), eq(todoistSyncEventsTable.itemId, eblastId)));
  }
  for (const todoistTaskId of todoistTaskIds) {
    await db
      .delete(todoistSyncEventsTable)
      .where(
        and(
          eq(todoistSyncEventsTable.itemType, "eblast"),
          eq(todoistSyncEventsTable.todoistTaskId, todoistTaskId),
          isNull(todoistSyncEventsTable.itemId),
        ),
      );
  }
}

describe("POST /shows/:showId/eblasts", () => {
  it("creates the e-blast and enqueues exactly one create sync event", async () => {
    const showId = await createTestShow();
    let eblastId: number | undefined;
    try {
      const res = await fetch(`${baseUrl}/shows/${showId}/eblasts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Eblast", dueDate: "2027-02-01" }),
      });
      expect(res.status).toBe(201);
      const eblast = (await res.json()) as { id: number };
      eblastId = eblast.id;

      const events = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "eblast"), eq(todoistSyncEventsTable.itemId, eblast.id)));

      expect(events).toHaveLength(1);
      expect(events[0].operation).toBe("upsert");
      expect(events[0].reason).toBe("create");
      expect(events[0].generation).toBe(1);
    } finally {
      await cleanupShowAndEvents(showId, eblastId ? [eblastId] : []);
    }
  });
});

describe("PUT /shows/:showId/eblasts/:eblastId", () => {
  it("marking sent enqueues a complete reason, coalesced with any prior active event", async () => {
    const showId = await createTestShow();
    const [eblast] = await db
      .insert(eblastsTable)
      .values({ showId, name: "Send Me", dueDate: "2027-02-01" })
      .returning();

    try {
      await fetch(`${baseUrl}/shows/${showId}/eblasts/${eblast.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "prep" }),
      });
      const res = await fetch(`${baseUrl}/shows/${showId}/eblasts/${eblast.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sent: true }),
      });
      expect(res.status).toBe(200);

      const events = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "eblast"), eq(todoistSyncEventsTable.itemId, eblast.id)));

      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe("complete");
      expect(events[0].generation).toBe(2);
    } finally {
      await cleanupShowAndEvents(showId, [eblast.id]);
    }
  });
});

describe("DELETE /shows/:showId/eblasts/:eblastId", () => {
  it("enqueues a delete sync event for a mapped e-blast and writes no new todoist_orphans row", async () => {
    const showId = await createTestShow();
    const todoistTaskId = `TEST-TDST-EBLASTDEL-${Date.now()}`;
    const [eblast] = await db
      .insert(eblastsTable)
      .values({ showId, name: "Delete Me", dueDate: "2027-02-01", todoistTaskId })
      .returning();

    try {
      const res = await fetch(`${baseUrl}/shows/${showId}/eblasts/${eblast.id}`, { method: "DELETE" });
      expect(res.status).toBe(204);

      const deleteEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(
          and(
            eq(todoistSyncEventsTable.itemType, "eblast"),
            eq(todoistSyncEventsTable.todoistTaskId, todoistTaskId),
            isNull(todoistSyncEventsTable.itemId),
          ),
        );
      expect(deleteEvents).toHaveLength(1);
      expect(deleteEvents[0].operation).toBe("delete");

      const orphans = await db
        .select()
        .from(todoistOrphansTable)
        .where(eq(todoistOrphansTable.todoistTaskId, todoistTaskId));
      expect(orphans).toHaveLength(0);
    } finally {
      await cleanupShowAndEvents(showId, [], [todoistTaskId]);
    }
  });

  it("supersedes a pending active sync event before enqueuing the delete", async () => {
    const showId = await createTestShow();
    const todoistTaskId = `TEST-TDST-EBLASTDEL-SUPERSEDE-${Date.now()}`;
    const [eblast] = await db
      .insert(eblastsTable)
      .values({ showId, name: "Delete Me With Pending Sync", dueDate: "2027-02-01", todoistTaskId })
      .returning();

    try {
      await db.transaction(async (tx) => {
        await enqueueSync(tx, { itemType: "eblast", itemId: eblast.id, reason: "update" });
      });

      const res = await fetch(`${baseUrl}/shows/${showId}/eblasts/${eblast.id}`, { method: "DELETE" });
      expect(res.status).toBe(204);

      const upsertEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "eblast"), eq(todoistSyncEventsTable.itemId, eblast.id)));
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
            eq(todoistSyncEventsTable.itemType, "eblast"),
            eq(todoistSyncEventsTable.todoistTaskId, todoistTaskId),
            isNull(todoistSyncEventsTable.itemId),
          ),
        );
      expect(deleteEvents).toHaveLength(1);
      expect(deleteEvents[0].status).toBe("pending");
    } finally {
      await cleanupShowAndEvents(showId, [eblast.id], [todoistTaskId]);
    }
  });

  it("supersedes an in_progress mapped sync event with a held claim token before enqueuing the delete", async () => {
    const showId = await createTestShow();
    const todoistTaskId = `TEST-TDST-EBLASTDEL-CLAIMED-${Date.now()}`;
    const [eblast] = await db
      .insert(eblastsTable)
      .values({ showId, name: "Delete Me With Claimed Sync", dueDate: "2027-02-01", todoistTaskId })
      .returning();

    try {
      await db.transaction(async (tx) => {
        await enqueueSync(tx, { itemType: "eblast", itemId: eblast.id, reason: "update" });
      });
      await db
        .update(todoistSyncEventsTable)
        .set({
          status: "in_progress",
          claimToken: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          claimedAt: new Date(),
        })
        .where(and(eq(todoistSyncEventsTable.itemType, "eblast"), eq(todoistSyncEventsTable.itemId, eblast.id)));

      const res = await fetch(`${baseUrl}/shows/${showId}/eblasts/${eblast.id}`, { method: "DELETE" });
      expect(res.status).toBe(204);

      const upsertEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(and(eq(todoistSyncEventsTable.itemType, "eblast"), eq(todoistSyncEventsTable.itemId, eblast.id)));
      expect(upsertEvents).toHaveLength(1);
      expect(upsertEvents[0].status).toBe("abandoned");
      expect(upsertEvents[0].lastError).toBe("Superseded by local deletion");
      expect(upsertEvents[0].claimToken).toBeNull();
      expect(upsertEvents[0].claimedAt).toBeNull();
      expect(upsertEvents[0].generation).toBe(1);

      const deleteEvents = await db
        .select()
        .from(todoistSyncEventsTable)
        .where(
          and(
            eq(todoistSyncEventsTable.itemType, "eblast"),
            eq(todoistSyncEventsTable.todoistTaskId, todoistTaskId),
            isNull(todoistSyncEventsTable.itemId),
          ),
        );
      expect(deleteEvents).toHaveLength(1);
      expect(deleteEvents[0].status).toBe("pending");
    } finally {
      await cleanupShowAndEvents(showId, [eblast.id], [todoistTaskId]);
    }
  });
});
