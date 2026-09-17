import { describe, it, expect, afterEach } from "vitest";
import { db, todoistSyncEventsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { enqueueSync, enqueueDelete, supersedeSync } from "./outbox";

// These exercise the real partial unique indexes (`todoist_sync_events_item_active`,
// `todoist_sync_events_delete_active`) against the dev database — coalescing is a
// Postgres constraint-conflict behavior that a mocked query builder cannot prove.
// Negative item ids are synthetic test markers: `tasks.id`/`eblasts.id` are always
// positive (serial), and `todoist_sync_events.item_id` carries no FK, so these never
// collide with real rows.
const TEST_ITEM_ID = -900001;
const TEST_ITEM_ID_2 = -900002;
const TEST_TODOIST_ID = "TEST-TDST-OUTBOX-DELETE-1";
const TEST_TODOIST_ID_2 = "TEST-TDST-OUTBOX-DELETE-2";

async function cleanupUpsertRows(itemId: number) {
  await db
    .delete(todoistSyncEventsTable)
    .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, itemId)));
}

async function cleanupDeleteRows(todoistTaskId: string) {
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

describe("enqueueSync", () => {
  afterEach(async () => {
    await cleanupUpsertRows(TEST_ITEM_ID);
    await cleanupUpsertRows(TEST_ITEM_ID_2);
  });

  it("a brand-new event starts at generation 1", async () => {
    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "create" });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    expect(rows).toHaveLength(1);
    expect(rows[0].generation).toBe(1);
  });

  it("repeated enqueues for the same item within one transaction coalesce onto a single active row carrying the latest reason and incrementing generation each time", async () => {
    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "create" });
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "update" });
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "complete" });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    expect(rows).toHaveLength(1);
    expect(rows[0].operation).toBe("upsert");
    expect(rows[0].reason).toBe("complete");
    expect(rows[0].status).toBe("pending");
    expect(rows[0].claimToken).toBeNull();
    // 1 (insert) + 2 coalesces.
    expect(rows[0].generation).toBe(3);
  });

  it("coalesces across separate committed transactions, not just within one", async () => {
    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "create" });
    });
    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "update" });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("update");
    expect(rows[0].claimToken).toBeNull();
    expect(rows[0].generation).toBe(2);
  });

  it("coalescing into a pending row with prior failed attempts fully resets retry/error state, increments generation, and preserves one active row", async () => {
    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "create" });
    });

    // Simulate a row that was previously attempted, failed, and requeued to pending
    // (the Phase 3A.2 retry path) — status is 'pending', but retry bookkeeping is stale.
    const staleNextAttemptAt = new Date(Date.now() + 5 * 60_000);
    await db
      .update(todoistSyncEventsTable)
      .set({
        status: "pending",
        attemptCount: 2,
        lastError: "Todoist API error 500: boom",
        nextAttemptAt: staleNextAttemptAt,
      })
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    const before = Date.now();
    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "update" });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.status).toBe("pending");
    expect(row.claimToken).toBeNull();
    expect(row.claimedAt).toBeNull();
    expect(row.attemptCount).toBe(0);
    expect(row.lastError).toBeNull();
    expect(row.reason).toBe("update");
    expect(row.generation).toBe(2);
    expect(row.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("coalescing into an in_progress row leaves status, claim, and attempt state untouched, only bumping generation and reason", async () => {
    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "create" });
    });

    // Simulate a worker holding this row claimed, mid-delivery, with prior failed attempts —
    // a Todoist HTTP call may be in flight right now, outside any DB transaction/row lock.
    const claimToken = "11111111-1111-1111-1111-111111111111";
    const claimedAt = new Date(Date.now() - 60_000);
    const seededNextAttemptAt = new Date(Date.now() + 5 * 60_000);
    await db
      .update(todoistSyncEventsTable)
      .set({
        status: "in_progress",
        claimToken,
        claimedAt,
        attemptCount: 3,
        nextAttemptAt: seededNextAttemptAt,
        lastError: "Todoist API error 500: boom",
      })
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "update" });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    expect(rows).toHaveLength(1);
    const row = rows[0];
    // Ownership/attempt state is completely undisturbed — the row must not become
    // claimable a second time while a worker may still have an external call in flight.
    expect(row.status).toBe("in_progress");
    expect(row.claimToken).toBe(claimToken);
    expect(row.claimedAt?.getTime()).toBe(claimedAt.getTime());
    expect(row.attemptCount).toBe(3);
    expect(row.nextAttemptAt.getTime()).toBe(seededNextAttemptAt.getTime());
    expect(row.lastError).toBe("Todoist API error 500: boom");
    // Only these two change — the "newer local intent arrived" signal.
    expect(row.reason).toBe("update");
    expect(row.generation).toBe(2);
  });

  it("a rolled-back transaction leaves no event", async () => {
    class SimulatedFailure extends Error {}

    await expect(
      db.transaction(async (tx) => {
        await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "create" });
        throw new SimulatedFailure("simulated failure after enqueue, before commit");
      }),
    ).rejects.toThrow(SimulatedFailure);

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    expect(rows).toHaveLength(0);
  });

  it("different items enqueue independent rows rather than coalescing with each other", async () => {
    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "create" });
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID_2, reason: "create" });
    });

    const rowsA = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));
    const rowsB = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID_2)));

    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].generation).toBe(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0].generation).toBe(1);
  });
});

describe("enqueueDelete", () => {
  afterEach(async () => {
    await cleanupDeleteRows(TEST_TODOIST_ID);
    await cleanupDeleteRows(TEST_TODOIST_ID_2);
  });

  it("a brand-new delete event starts at generation 1", async () => {
    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(
        and(
          eq(todoistSyncEventsTable.itemType, "task"),
          eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID),
          isNull(todoistSyncEventsTable.itemId),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].generation).toBe(1);
  });

  it("repeated deletes for the same remote task coalesce onto a single active row without incrementing generation", async () => {
    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID });
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(
        and(
          eq(todoistSyncEventsTable.itemType, "task"),
          eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID),
          isNull(todoistSyncEventsTable.itemId),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].operation).toBe("delete");
    expect(rows[0].itemId).toBeNull();
    expect(rows[0].claimToken).toBeNull();
    // A delete has no local row left to re-read, so unlike enqueueSync, repeated
    // delete intent is the same idempotent end state and never bumps generation.
    expect(rows[0].generation).toBe(1);
  });

  it("repeated delete enqueues across several separate committed transactions never increment generation", async () => {
    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID });
    });
    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID });
    });
    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(
        and(
          eq(todoistSyncEventsTable.itemType, "task"),
          eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID),
          isNull(todoistSyncEventsTable.itemId),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].generation).toBe(1);
  });

  it("coalescing into a pending delete row with prior failed attempts fully resets retry/error state, preserves generation, and preserves one active row", async () => {
    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID, reason: "delete" });
    });

    const staleNextAttemptAt = new Date(Date.now() + 5 * 60_000);
    await db
      .update(todoistSyncEventsTable)
      .set({
        status: "pending",
        attemptCount: 2,
        lastError: "Todoist API error 500: boom",
        nextAttemptAt: staleNextAttemptAt,
        generation: 3,
      })
      .where(
        and(
          eq(todoistSyncEventsTable.itemType, "task"),
          eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID),
          isNull(todoistSyncEventsTable.itemId),
        ),
      );

    const before = Date.now();
    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID, reason: "unlink" });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(
        and(
          eq(todoistSyncEventsTable.itemType, "task"),
          eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID),
          isNull(todoistSyncEventsTable.itemId),
        ),
      );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.status).toBe("pending");
    expect(row.claimToken).toBeNull();
    expect(row.claimedAt).toBeNull();
    expect(row.attemptCount).toBe(0);
    expect(row.lastError).toBeNull();
    expect(row.reason).toBe("unlink");
    // Generation is preserved from whatever the existing row already carried — not
    // reset to 1 and not incremented.
    expect(row.generation).toBe(3);
    expect(row.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("coalescing into an in_progress delete row leaves status, claim, attempt state, and generation untouched, only updating reason", async () => {
    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID, reason: "delete" });
    });

    const claimToken = "22222222-2222-2222-2222-222222222222";
    const claimedAt = new Date(Date.now() - 60_000);
    const seededNextAttemptAt = new Date(Date.now() + 5 * 60_000);
    await db
      .update(todoistSyncEventsTable)
      .set({
        status: "in_progress",
        claimToken,
        claimedAt,
        attemptCount: 2,
        nextAttemptAt: seededNextAttemptAt,
        lastError: "Todoist API error 500: boom",
        generation: 5,
      })
      .where(
        and(
          eq(todoistSyncEventsTable.itemType, "task"),
          eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID),
          isNull(todoistSyncEventsTable.itemId),
        ),
      );

    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID, reason: "unlink" });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(
        and(
          eq(todoistSyncEventsTable.itemType, "task"),
          eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID),
          isNull(todoistSyncEventsTable.itemId),
        ),
      );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.status).toBe("in_progress");
    expect(row.claimToken).toBe(claimToken);
    expect(row.claimedAt?.getTime()).toBe(claimedAt.getTime());
    expect(row.attemptCount).toBe(2);
    expect(row.nextAttemptAt.getTime()).toBe(seededNextAttemptAt.getTime());
    expect(row.lastError).toBe("Todoist API error 500: boom");
    expect(row.reason).toBe("unlink");
    // A worker may have an external Todoist DELETE in flight for this row — repeated
    // delete intent must not look like newer work requiring re-finalization.
    expect(row.generation).toBe(5);
  });

  it("regression: coalescing into an in_progress delete event with generation already above 1 leaves every claim/retry/error field and the seeded generation untouched, updating only reason and updatedAt", async () => {
    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID, reason: "delete" });
    });

    const seededGeneration = 7;
    const claimToken = "44444444-4444-4444-4444-444444444444";
    const claimedAt = new Date(Date.now() - 120_000);
    const seededNextAttemptAt = new Date(Date.now() + 10 * 60_000);
    const seededLastError = "Todoist API error 503: service unavailable";
    await db
      .update(todoistSyncEventsTable)
      .set({
        status: "in_progress",
        claimToken,
        claimedAt,
        attemptCount: 4,
        nextAttemptAt: seededNextAttemptAt,
        lastError: seededLastError,
        generation: seededGeneration,
      })
      .where(
        and(
          eq(todoistSyncEventsTable.itemType, "task"),
          eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID),
          isNull(todoistSyncEventsTable.itemId),
        ),
      );

    const before = Date.now();
    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID, reason: "unlink" });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(
        and(
          eq(todoistSyncEventsTable.itemType, "task"),
          eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID),
          isNull(todoistSyncEventsTable.itemId),
        ),
      );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    // Every retained field is byte-for-byte the seeded value — nothing here is
    // coincidentally equal to a default.
    expect(row.status).toBe("in_progress");
    expect(row.claimToken).toBe(claimToken);
    expect(row.claimedAt?.getTime()).toBe(claimedAt.getTime());
    expect(row.attemptCount).toBe(4);
    expect(row.nextAttemptAt.getTime()).toBe(seededNextAttemptAt.getTime());
    expect(row.lastError).toBe(seededLastError);
    expect(row.generation).toBe(seededGeneration);
    // Only these two are allowed to change.
    expect(row.reason).toBe("unlink");
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("a rolled-back delete enqueue leaves no event", async () => {
    class SimulatedFailure extends Error {}

    await expect(
      db.transaction(async (tx) => {
        await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID });
        throw new SimulatedFailure("simulated failure after enqueue, before commit");
      }),
    ).rejects.toThrow(SimulatedFailure);

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID)));

    expect(rows).toHaveLength(0);
  });

  it("different remote task ids enqueue independent rows", async () => {
    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID });
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID_2 });
    });

    const rowsA = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID)));
    const rowsB = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID_2)));

    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].claimToken).toBeNull();
    expect(rowsA[0].generation).toBe(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0].claimToken).toBeNull();
    expect(rowsB[0].generation).toBe(1);
  });
});

describe("supersedeSync", () => {
  afterEach(async () => {
    await cleanupUpsertRows(TEST_ITEM_ID);
    await cleanupDeleteRows(TEST_TODOIST_ID);
  });

  it("marks an active upsert event abandoned with the exact diagnostic message, clearing any held claim but leaving attempt bookkeeping untouched", async () => {
    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "update" });
    });

    // Simulate a worker holding this row claimed, mid-retry, at the moment of local deletion.
    const seededNextAttemptAt = new Date(Date.now() + 5 * 60_000);
    await db
      .update(todoistSyncEventsTable)
      .set({
        status: "in_progress",
        claimToken: "33333333-3333-3333-3333-333333333333",
        claimedAt: new Date(),
        attemptCount: 2,
        nextAttemptAt: seededNextAttemptAt,
        generation: 4,
      })
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    await db.transaction(async (tx) => {
      await supersedeSync(tx, { itemType: "task", itemId: TEST_ITEM_ID });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("abandoned");
    expect(rows[0].lastError).toBe("Superseded by local deletion");
    expect(rows[0].claimToken).toBeNull();
    expect(rows[0].claimedAt).toBeNull();
    // Abandonment is terminal — attempt bookkeeping and generation are historical
    // record, not reset.
    expect(rows[0].attemptCount).toBe(2);
    expect(rows[0].nextAttemptAt.getTime()).toBe(seededNextAttemptAt.getTime());
    expect(rows[0].generation).toBe(4);
  });

  it("does nothing when there is no active event for the item", async () => {
    await db.transaction(async (tx) => {
      await supersedeSync(tx, { itemType: "task", itemId: TEST_ITEM_ID });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    expect(rows).toHaveLength(0);
  });

  it("does not touch an already-terminal event (delivered/abandoned), leaving it as-is", async () => {
    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "update" });
    });
    await db
      .update(todoistSyncEventsTable)
      .set({ status: "delivered" })
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    await db.transaction(async (tx) => {
      await supersedeSync(tx, { itemType: "task", itemId: TEST_ITEM_ID });
    });

    const rows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].lastError).toBeNull();
  });

  it("supersede immediately followed by a delete enqueue, then a rollback, leaves neither change committed", async () => {
    await db.transaction(async (tx) => {
      await enqueueSync(tx, { itemType: "task", itemId: TEST_ITEM_ID, reason: "update" });
    });

    class SimulatedFailure extends Error {}

    await expect(
      db.transaction(async (tx) => {
        await supersedeSync(tx, { itemType: "task", itemId: TEST_ITEM_ID });
        await enqueueDelete(tx, { itemType: "task", todoistTaskId: TEST_TODOIST_ID });
        throw new SimulatedFailure("simulated failure after supersede + enqueue, before commit");
      }),
    ).rejects.toThrow(SimulatedFailure);

    const upsertRows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(and(eq(todoistSyncEventsTable.itemType, "task"), eq(todoistSyncEventsTable.itemId, TEST_ITEM_ID)));
    expect(upsertRows).toHaveLength(1);
    expect(upsertRows[0].status).toBe("pending");
    expect(upsertRows[0].lastError).toBeNull();

    const deleteRows = await db
      .select()
      .from(todoistSyncEventsTable)
      .where(
        and(
          eq(todoistSyncEventsTable.itemType, "task"),
          eq(todoistSyncEventsTable.todoistTaskId, TEST_TODOIST_ID),
          isNull(todoistSyncEventsTable.itemId),
        ),
      );
    expect(deleteRows).toHaveLength(0);
  });
});
