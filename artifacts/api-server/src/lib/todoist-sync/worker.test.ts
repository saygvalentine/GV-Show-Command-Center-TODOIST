import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import {
  db,
  pool,
  showsTable,
  tasksTable,
  eblastsTable,
  todoistSyncEventsTable,
  todoistSettingsTable,
  TODOIST_SETTINGS_ID,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { enqueueSync, enqueueDelete, supersedeSync } from "./outbox";
import { defaultDeliveryDeps, type DeliveryDeps } from "./delivery";
import { logger } from "../logger";
import {
  drainTodoistOutbox,
  claimOnePendingEvent,
  reclaimOneStaleEvent,
  processClaimedEvent,
  backoffMs,
} from "./worker";

// Claim/reclaim/finalize behavior is exercised against the real dev database — the
// partial unique indexes, `FOR UPDATE SKIP LOCKED`, and the conditional finalize writes
// are genuine Postgres behaviors a mocked query builder cannot prove (same rationale as
// outbox.test.ts). Todoist delivery itself is always exercised through injected
// `DeliveryDeps` — no real network call is ever reachable from this file.

let showIds: number[] = [];
let eventIds: number[] = [];
let originalSettings: { taskProjectId: string | null; eblastProjectId: string | null };

beforeAll(async () => {
  const [row] = await db.select().from(todoistSettingsTable).where(eq(todoistSettingsTable.id, TODOIST_SETTINGS_ID));
  originalSettings = row
    ? { taskProjectId: row.taskProjectId, eblastProjectId: row.eblastProjectId }
    : { taskProjectId: null, eblastProjectId: null };
});

afterEach(async () => {
  await db.update(todoistSettingsTable).set(originalSettings).where(eq(todoistSettingsTable.id, TODOIST_SETTINGS_ID));
  for (const id of eventIds) {
    await db.delete(todoistSyncEventsTable).where(eq(todoistSyncEventsTable.id, id));
  }
  for (const id of showIds) {
    await db.delete(showsTable).where(eq(showsTable.id, id)); // cascades tasks/eblasts
  }
  showIds = [];
  eventIds = [];
});

async function setSettings(overrides: Partial<{ taskProjectId: string | null; eblastProjectId: string | null }>) {
  await db.update(todoistSettingsTable).set(overrides).where(eq(todoistSettingsTable.id, TODOIST_SETTINGS_ID));
}

async function makeShow(): Promise<number> {
  const [show] = await db.insert(showsTable).values({ name: "Worker Test Show", moveInDate: "2027-01-01" }).returning();
  showIds.push(show.id);
  return show.id;
}

async function makeTask(showId: number, overrides: Partial<typeof tasksTable.$inferInsert> = {}) {
  const [task] = await db
    .insert(tasksTable)
    .values({ showId, name: "Worker Test Task", dueDate: "2027-01-01", ...overrides })
    .returning();
  return task;
}

async function makeEblast(showId: number, overrides: Partial<typeof eblastsTable.$inferInsert> = {}) {
  const [eblast] = await db
    .insert(eblastsTable)
    .values({ showId, name: "Worker Test Eblast", dueDate: "2027-01-01", ...overrides })
    .returning();
  return eblast;
}

// Defaults to already-due (`nextAttemptAt` at the epoch) so a bare `makeEvent(...)` is
// immediately claimable without every test having to spell that out.
async function makeEvent(overrides: Partial<typeof todoistSyncEventsTable.$inferInsert>) {
  const [row] = await db
    .insert(todoistSyncEventsTable)
    .values({
      itemType: "task",
      operation: "upsert",
      reason: "create",
      status: "pending",
      generation: 1,
      nextAttemptAt: new Date(0),
      ...overrides,
    })
    .returning();
  eventIds.push(row.id);
  return row;
}

function deps(todoistRequest: DeliveryDeps["todoistRequest"]): DeliveryDeps {
  return { ...defaultDeliveryDeps, todoistRequest };
}

async function loadEvent(id: number) {
  const [row] = await db.select().from(todoistSyncEventsTable).where(eq(todoistSyncEventsTable.id, id));
  return row;
}

describe("claimOnePendingEvent", () => {
  it("claims a due pending event: fresh claim token, incremented attemptCount, full ownership data returned", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    const event = await makeEvent({ itemType: "task", itemId: task.id, operation: "upsert" });

    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(event.id);
    expect(claimed!.operation).toBe("upsert");
    expect(claimed!.itemType).toBe("task");
    expect(claimed!.itemId).toBe(task.id);
    expect(claimed!.claimToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(claimed!.generation).toBe(1);
    expect(claimed!.attemptCount).toBe(1);

    const row = await loadEvent(event.id);
    expect(row.status).toBe("in_progress");
    expect(row.claimToken).toBe(claimed!.claimToken);
    expect(row.claimedAt).not.toBeNull();
  });

  it("does not claim a pending event whose nextAttemptAt is in the future", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    await makeEvent({ itemType: "task", itemId: task.id, nextAttemptAt: new Date(Date.now() + 60_000) });

    const claimed = await claimOnePendingEvent(randomUUID(), new Date());
    expect(claimed).toBeNull();
  });

  it("SKIP LOCKED: a row locked by another session is not claimed until released", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    const event = await makeEvent({ itemType: "task", itemId: task.id });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM todoist_sync_events WHERE id = $1 FOR UPDATE", [event.id]);

      const claimedWhileLocked = await claimOnePendingEvent(randomUUID(), new Date());
      expect(claimedWhileLocked?.id).not.toBe(event.id);

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const claimedAfterRelease = await claimOnePendingEvent(randomUUID(), new Date());
    expect(claimedAfterRelease?.id).toBe(event.id);
  });
});

describe("reclaimOneStaleEvent", () => {
  it("reclaims a stale in_progress event: new claim token, incremented attemptCount, generation and status preserved", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    const staleClaimedAt = new Date(Date.now() - 6 * 60_000);
    const event = await makeEvent({
      itemType: "task",
      itemId: task.id,
      status: "in_progress",
      claimToken: "11111111-1111-1111-1111-111111111111",
      claimedAt: staleClaimedAt,
      attemptCount: 2,
      generation: 3,
    });

    const reclaimed = await reclaimOneStaleEvent(randomUUID(), new Date());

    expect(reclaimed).not.toBeNull();
    expect(reclaimed!.id).toBe(event.id);
    expect(reclaimed!.claimToken).not.toBe("11111111-1111-1111-1111-111111111111");
    expect(reclaimed!.attemptCount).toBe(3);
    expect(reclaimed!.generation).toBe(3);

    const row = await loadEvent(event.id);
    expect(row.status).toBe("in_progress");
  });

  it("crash/recovery: a claimed-but-unfinalized event becomes reclaimable after 5 minutes, and the dead worker's old token can no longer modify it", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    const event = await makeEvent({ itemType: "task", itemId: task.id });
    const originalToken = randomUUID();
    const claimed = await claimOnePendingEvent(originalToken, new Date(Date.now() - 6 * 60_000));
    expect(claimed!.claimToken).toBe(originalToken);

    const reclaimed = await reclaimOneStaleEvent(randomUUID(), new Date());
    expect(reclaimed?.id).toBe(event.id);
    expect(reclaimed!.claimToken).not.toBe(originalToken);

    const rows = await db
      .update(todoistSyncEventsTable)
      .set({ status: "delivered", claimToken: null })
      .where(and(eq(todoistSyncEventsTable.id, event.id), eq(todoistSyncEventsTable.claimToken, originalToken)))
      .returning({ id: todoistSyncEventsTable.id });
    expect(rows).toHaveLength(0);
  });
});

describe("processClaimedEvent — upsert", () => {
  it("pre-call ownership recheck: a claim lost before delivery makes zero Todoist calls and reports lostClaim", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    const event = await makeEvent({ itemType: "task", itemId: task.id });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    await db
      .update(todoistSyncEventsTable)
      .set({ claimToken: "99999999-9999-9999-9999-999999999999" })
      .where(eq(todoistSyncEventsTable.id, event.id));

    const todoistRequest = vi.fn();
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("lostClaim");
    expect(todoistRequest).not.toHaveBeenCalled();
  });

  it("success at the captured generation finalizes as delivered", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    await setSettings({ taskProjectId: "PROJ-1" });
    const event = await makeEvent({ itemType: "task", itemId: task.id });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    const todoistRequest = vi.fn(async () => ({ id: "TDST-1" }));
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("delivered");
    const row = await loadEvent(event.id);
    expect(row.status).toBe("delivered");
    expect(row.claimToken).toBeNull();
    expect(row.claimedAt).toBeNull();
    expect(row.lastError).toBeNull();
  });

  it("success when generation moved on during delivery requeues to pending for immediate redelivery, preserving generation and attemptCount", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    await setSettings({ taskProjectId: "PROJ-1" });
    const event = await makeEvent({ itemType: "task", itemId: task.id });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    // The edit must land strictly between the worker's pre-call generation capture and
    // its finalize — i.e. while the (mocked) Todoist call is "in flight" — not before
    // processClaimedEvent even starts, or the worker would simply capture the new
    // generation and this wouldn't be racing anything. Triggering it as a side effect of
    // the mock's first invocation reproduces that window; guarded so a second delivery
    // call (e.g. the reopen/close completion step) doesn't coalesce a second time.
    let sideEffectDone = false;
    const todoistRequest = vi.fn(async () => {
      if (!sideEffectDone) {
        sideEffectDone = true;
        await db.transaction(async (tx) => {
          await enqueueSync(tx, { itemType: "task", itemId: task.id, reason: "update" });
        });
      }
      return { id: "TDST-2" };
    });
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("requeued");
    const row = await loadEvent(event.id);
    expect(row.status).toBe("pending");
    expect(row.claimToken).toBeNull();
    expect(row.generation).toBe(2);
    expect(row.attemptCount).toBe(1);
  });

  it("a local row missing by processing time terminates immediately: abandoned, claim state cleared, no Todoist call, no exception", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    const event = await makeEvent({ itemType: "task", itemId: task.id });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    // Delete the local row out from under the claim (simulates the row's own delete
    // route having removed it after this claim was taken, before this worker got to it).
    await db.delete(tasksTable).where(eq(tasksTable.id, task.id));

    const todoistRequest = vi.fn();
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("abandoned");
    expect(todoistRequest).not.toHaveBeenCalled();
    const row = await loadEvent(event.id);
    expect(row.status).toBe("abandoned");
    expect(row.claimToken).toBeNull();
    expect(row.claimedAt).toBeNull();
  });

  it("ownership recheck happens before project-configuration handling: a superseded claim reports lostClaim, not a misleading missing-configuration failure", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    await setSettings({ taskProjectId: null }); // genuinely missing configuration
    const event = await makeEvent({ itemType: "task", itemId: task.id });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    // Simulates the local delete route racing in: supersedeSync abandons the row and
    // clears claim state concurrently with this worker still holding what it thinks is
    // an active claim — before this worker has even looked at settings.
    await db.transaction(async (tx) => {
      await supersedeSync(tx, { itemType: "task", itemId: task.id });
    });

    const todoistRequest = vi.fn();
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("lostClaim");
    expect(todoistRequest).not.toHaveBeenCalled();
    const row = await loadEvent(event.id);
    // Untouched by any missing-configuration finalize — the abandon from supersedeSync
    // (with its own "Superseded by local deletion" message) is the only write that ever
    // landed; it must never be overwritten with the missing-configuration message.
    expect(row.status).toBe("abandoned");
    expect(row.lastError).toBe("Superseded by local deletion");
  });

  it("missing Todoist project configuration for a task fails immediately with the exact error and no Todoist call", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    await setSettings({ taskProjectId: null });
    const event = await makeEvent({ itemType: "task", itemId: task.id });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    const todoistRequest = vi.fn();
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("failed");
    expect(todoistRequest).not.toHaveBeenCalled();
    const row = await loadEvent(event.id);
    expect(row.status).toBe("failed");
    expect(row.lastError).toBe("Todoist project not configured for task");
    expect(row.claimToken).toBeNull();
  });

  it("missing Todoist project configuration for an eblast fails immediately with the exact error and no Todoist call", async () => {
    const showId = await makeShow();
    const eblast = await makeEblast(showId);
    await setSettings({ eblastProjectId: null });
    const event = await makeEvent({ itemType: "eblast", itemId: eblast.id });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    const todoistRequest = vi.fn();
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("failed");
    expect(todoistRequest).not.toHaveBeenCalled();
    const row = await loadEvent(event.id);
    expect(row.lastError).toBe("Todoist project not configured for eblast");
  });

  it("mapped-item failure below the attempt ceiling requeues with backoff", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId, { todoistTaskId: "TDST-EXISTING-1" });
    await setSettings({ taskProjectId: "PROJ-1" });
    const event = await makeEvent({ itemType: "task", itemId: task.id, attemptCount: 0 });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());
    expect(claimed!.attemptCount).toBe(1);

    const todoistRequest = vi.fn(async () => {
      throw new Error("Todoist API error 503: boom");
    });
    const before = Date.now();
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("requeued");
    const row = await loadEvent(event.id);
    expect(row.status).toBe("pending");
    expect(row.claimToken).toBeNull();
    expect(row.lastError).toContain("503");
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(before);
  });

  it("mapped-item failure at the attempt ceiling fails terminally", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId, { todoistTaskId: "TDST-EXISTING-2" });
    await setSettings({ taskProjectId: "PROJ-1" });
    const event = await makeEvent({ itemType: "task", itemId: task.id, attemptCount: 7 });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());
    expect(claimed!.attemptCount).toBe(8);

    const todoistRequest = vi.fn(async () => {
      throw new Error("Todoist API error 503: boom");
    });
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("failed");
    const row = await loadEvent(event.id);
    expect(row.status).toBe("failed");
    expect(row.claimToken).toBeNull();
  });

  it("unmapped create failure is terminal immediately, never scheduled for retry, and emits the ambiguous-create log", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId); // todoistTaskId null
    await setSettings({ taskProjectId: "PROJ-1" });
    const event = await makeEvent({ itemType: "task", itemId: task.id, attemptCount: 0 });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    const todoistRequest = vi.fn(async () => {
      throw new Error("Todoist API error 504: gateway timeout");
    });
    const errorSpy = vi.spyOn(logger, "error");
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("failed");
    const row = await loadEvent(event.id);
    expect(row.status).toBe("failed");
    expect(row.claimToken).toBeNull();
    expect(
      errorSpy.mock.calls.some(([payload]) => (payload as Record<string, unknown>)?.event === "todoist_create_outcome_ambiguous"),
    ).toBe(true);
    errorSpy.mockRestore();
  });

  it("a supersede during a claimed upsert prevents the stale worker from reviving the row on finalize", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    await setSettings({ taskProjectId: "PROJ-1" });
    const event = await makeEvent({ itemType: "task", itemId: task.id });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    // Simulates the local delete route: supersedeSync abandons the row and clears claim
    // state concurrently with this worker still holding what it thinks is an active claim.
    await db.transaction(async (tx) => {
      await supersedeSync(tx, { itemType: "task", itemId: task.id });
    });

    const todoistRequest = vi.fn(async () => ({ id: "TDST-3" }));
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("lostClaim");
    expect(todoistRequest).not.toHaveBeenCalled();
    const row = await loadEvent(event.id);
    expect(row.status).toBe("abandoned");
  });
});

describe("processClaimedEvent — delete", () => {
  it("a normal delete success finalizes as delivered", async () => {
    const event = await makeEvent({ itemType: "task", itemId: null, operation: "delete", todoistTaskId: "TDST-DEL-1" });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    const todoistRequest = vi.fn(async () => ({}));
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("delivered");
    expect(todoistRequest).toHaveBeenCalledWith("DELETE", "/api/v1/tasks/TDST-DEL-1");
    const row = await loadEvent(event.id);
    expect(row.status).toBe("delivered");
    expect(row.claimToken).toBeNull();
  });

  it("a 404/null delete response is idempotent success, same as delivered", async () => {
    const event = await makeEvent({ itemType: "task", itemId: null, operation: "delete", todoistTaskId: "TDST-DEL-2" });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    const todoistRequest = vi.fn(async () => null);
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("delivered");
  });

  it("delete failure below the attempt ceiling requeues with backoff", async () => {
    const event = await makeEvent({
      itemType: "task",
      itemId: null,
      operation: "delete",
      todoistTaskId: "TDST-DEL-3",
      attemptCount: 0,
    });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    const todoistRequest = vi.fn(async () => {
      throw new Error("Todoist API error 503: boom");
    });
    const before = Date.now();
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("requeued");
    const row = await loadEvent(event.id);
    expect(row.status).toBe("pending");
    expect(row.claimToken).toBeNull();
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(before);
  });

  it("delete failure at the attempt ceiling fails terminally", async () => {
    const event = await makeEvent({
      itemType: "task",
      itemId: null,
      operation: "delete",
      todoistTaskId: "TDST-DEL-4",
      attemptCount: 7,
    });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());
    expect(claimed!.attemptCount).toBe(8);

    const todoistRequest = vi.fn(async () => {
      throw new Error("Todoist API error 503: boom");
    });
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("failed");
    const row = await loadEvent(event.id);
    expect(row.status).toBe("failed");
  });

  it("a delete event missing todoistTaskId fails immediately with the exact error and no Todoist call", async () => {
    const event = await makeEvent({ itemType: "task", itemId: null, operation: "delete", todoistTaskId: null });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    const todoistRequest = vi.fn();
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("failed");
    expect(todoistRequest).not.toHaveBeenCalled();
    const row = await loadEvent(event.id);
    expect(row.lastError).toBe("Delete event missing todoistTaskId");
  });

  it("a duplicate delete enqueue while in progress leaves the held claim valid and finalization still succeeds", async () => {
    const event = await makeEvent({ itemType: "task", itemId: null, operation: "delete", todoistTaskId: "TDST-DEL-5" });
    const claimed = await claimOnePendingEvent(randomUUID(), new Date());

    await db.transaction(async (tx) => {
      await enqueueDelete(tx, { itemType: "task", todoistTaskId: "TDST-DEL-5", reason: "unlink" });
    });

    const todoistRequest = vi.fn(async () => null);
    const outcome = await processClaimedEvent(claimed!, deps(todoistRequest), new Date());

    expect(outcome).toBe("delivered");
    const row = await loadEvent(event.id);
    expect(row.status).toBe("delivered");
  });
});

describe("backoffMs", () => {
  it("computes the documented base delay plus at most 10% jitter, for every attempt in range", () => {
    const bases = [30, 60, 120, 240, 480, 960, 1920, 3840];
    for (let attempt = 1; attempt <= 8; attempt++) {
      const baseMs = bases[attempt - 1] * 1000;
      expect(backoffMs(attempt, () => 0)).toBe(baseMs);
      expect(backoffMs(attempt, () => 1)).toBeCloseTo(baseMs * 1.1, 0);
      const mid = backoffMs(attempt, () => 0.5);
      expect(mid).toBeGreaterThanOrEqual(baseMs);
      expect(mid).toBeLessThanOrEqual(baseMs * 1.1);
    }
  });

  it("clamps out-of-range attempt counts to the schedule's bounds", () => {
    expect(backoffMs(0, () => 0)).toBe(30_000);
    expect(backoffMs(99, () => 0)).toBe(3_840_000);
  });
});

describe("drainTodoistOutbox", () => {
  it("claims at most batchSize events even when more are due", async () => {
    const showId = await makeShow();
    const tasks = await Promise.all([1, 2, 3].map(() => makeTask(showId)));
    for (const t of tasks) await makeEvent({ itemType: "task", itemId: t.id });

    const summary = await drainTodoistOutbox({
      batchSize: 2,
      concurrency: 1,
      maxRuntimeMs: 5000,
      deps: deps(vi.fn(async () => ({ id: `TDST-${randomUUID()}` }))),
    });

    expect(summary.claimed).toBe(2);
  });

  it("stops claiming once maxRuntimeMs is already exhausted", async () => {
    const showId = await makeShow();
    const task = await makeTask(showId);
    await makeEvent({ itemType: "task", itemId: task.id });

    const summary = await drainTodoistOutbox({ batchSize: 10, maxRuntimeMs: 0, deps: deps(vi.fn()) });

    expect(summary.claimed).toBe(0);
  });

  it("never leaves a newly claimed event in_progress when the runtime deadline expires mid-batch", async () => {
    const showId = await makeShow();
    await setSettings({ taskProjectId: "PROJ-1" });
    const tasks = await Promise.all([1, 2, 3, 4].map(() => makeTask(showId)));
    const events = [];
    for (const t of tasks) events.push(await makeEvent({ itemType: "task", itemId: t.id }));

    const todoistRequest = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { id: `TDST-${randomUUID()}` };
    });

    const summary = await drainTodoistOutbox({
      batchSize: 4,
      concurrency: 1,
      maxRuntimeMs: 60,
      deps: deps(todoistRequest),
    });

    // The short budget means not everything gets claimed...
    expect(summary.claimed).toBeGreaterThan(0);
    expect(summary.claimed).toBeLessThan(4);
    // ...but every event this drain DID claim was fully processed to a tally, not
    // stranded mid-claim by the deadline.
    const processed = summary.delivered + summary.requeued + summary.failed + summary.abandoned + summary.lostClaim;
    expect(processed).toBe(summary.claimed);

    // Every test event ends up either still `pending` (never claimed this cycle) or in
    // some terminal/pending state from being processed — never left `in_progress`.
    const rows = await Promise.all(events.map((e) => loadEvent(e.id)));
    for (const row of rows) {
      expect(row.status).not.toBe("in_progress");
    }
  });

  it("processes at most `concurrency` events at once", async () => {
    const showId = await makeShow();
    await setSettings({ taskProjectId: "PROJ-1" });
    const tasks = await Promise.all([1, 2, 3, 4].map(() => makeTask(showId)));
    for (const t of tasks) await makeEvent({ itemType: "task", itemId: t.id });

    let active = 0;
    let maxActive = 0;
    const todoistRequest = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      active--;
      return { id: `TDST-${randomUUID()}` };
    });

    await drainTodoistOutbox({ batchSize: 4, concurrency: 2, maxRuntimeMs: 5000, deps: deps(todoistRequest) });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(maxActive).toBeGreaterThan(1);
  });
});
