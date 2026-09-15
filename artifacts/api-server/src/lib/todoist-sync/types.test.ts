import { describe, it, expect } from "vitest";
import { tallyOutcome, buildDeliveryFailureLog, type DeliveryOutcome, type SyncCounters, type DeliveryResult } from "./types";

describe("tallyOutcome", () => {
  it("folds a mixed batch of every outcome into the manual sync response shape", () => {
    const counters: SyncCounters = {
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      unlinked: 0,
      failed: 0,
    };

    // One item per outcome — mirrors the manual route's `{ ok: true, ...counters }`
    // response for a batch containing: one create, one update, one undated
    // skip, one 404/unlink, and one ordinary failure (no delete in this batch).
    const outcomes: DeliveryOutcome[] = [
      "created",
      "updated",
      "skipped_no_due_date",
      "unlinked_remote_missing",
      "failed",
    ];

    for (const outcome of outcomes) {
      tallyOutcome(counters, outcome);
    }

    expect({ ok: true, ...counters }).toEqual({
      ok: true,
      created: 1,
      updated: 1,
      deleted: 0,
      skipped: 1,
      unlinked: 1,
      failed: 1,
    });
  });

  it("every DeliveryOutcome value increments exactly one counter", () => {
    const allOutcomes: DeliveryOutcome[] = [
      "created",
      "updated",
      "deleted",
      "skipped_no_due_date",
      "unlinked_remote_missing",
      "failed",
    ];

    for (const outcome of allOutcomes) {
      const counters: SyncCounters = {
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        unlinked: 0,
        failed: 0,
      };
      tallyOutcome(counters, outcome);
      const total = Object.values(counters).reduce((sum, n) => sum + n, 0);
      expect(total).toBe(1);
    }
  });
});

describe("buildDeliveryFailureLog", () => {
  it("returns a structured payload retaining the diagnostic error for a failed delivery", () => {
    const result: DeliveryResult = {
      itemType: "task",
      itemId: 42,
      outcome: "failed",
      todoistTaskId: "TDST-9",
      completionAction: "none",
      error: "Todoist API error 500: boom",
    };

    const log = buildDeliveryFailureLog(result);

    expect(log).toEqual({
      event: "todoist_delivery_failed",
      itemType: "task",
      itemId: 42,
      todoistTaskId: "TDST-9",
      error: "Todoist API error 500: boom",
    });
  });

  it("returns null for every non-failed outcome", () => {
    const nonFailedOutcomes: DeliveryOutcome[] = [
      "created",
      "updated",
      "deleted",
      "skipped_no_due_date",
      "unlinked_remote_missing",
    ];

    for (const outcome of nonFailedOutcomes) {
      const result: DeliveryResult = {
        itemType: "eblast",
        itemId: 7,
        outcome,
        todoistTaskId: null,
        completionAction: "none",
      };
      expect(buildDeliveryFailureLog(result)).toBeNull();
    }
  });

  it("preserves an undefined error rather than substituting a fallback", () => {
    const result: DeliveryResult = {
      itemType: "task",
      itemId: 1,
      outcome: "failed",
      todoistTaskId: null,
      completionAction: "none",
      // error deliberately omitted
    };

    expect(buildDeliveryFailureLog(result)).toEqual({
      event: "todoist_delivery_failed",
      itemType: "task",
      itemId: 1,
      todoistTaskId: null,
      error: undefined,
    });
  });
});
