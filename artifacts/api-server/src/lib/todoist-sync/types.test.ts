import { describe, it, expect } from "vitest";
import { tallyOutcome, type DeliveryOutcome, type SyncCounters } from "./types";

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
