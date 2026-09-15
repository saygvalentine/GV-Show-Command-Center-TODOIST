export type TodoistItemType = "task" | "eblast";

export type DeliveryOutcome =
  | "created"
  | "updated"
  | "deleted"
  | "skipped_no_due_date"
  | "unlinked_remote_missing"
  | "failed";

export type CompletionAction = "closed" | "reopened" | "none";

export interface DeliveryResult {
  itemType: TodoistItemType;
  itemId: number;
  outcome: DeliveryOutcome;
  // The local todoistTaskId as it stands after this delivery attempt.
  todoistTaskId: string | null;
  completionAction: CompletionAction;
  error?: string;
}

export interface SyncCounters {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  unlinked: number;
  failed: number;
}

// Maps every typed delivery outcome onto the manual route's response shape.
// Every outcome is tallied somewhere — none are silently dropped, so a
// caller can no longer report success while items were skipped, unlinked
// (404), or failed.
export function tallyOutcome(counters: SyncCounters, outcome: DeliveryOutcome): void {
  if (outcome === "created") counters.created++;
  else if (outcome === "updated") counters.updated++;
  else if (outcome === "deleted") counters.deleted++;
  else if (outcome === "skipped_no_due_date") counters.skipped++;
  else if (outcome === "unlinked_remote_missing") counters.unlinked++;
  else if (outcome === "failed") counters.failed++;
}

export interface DeliveryFailureLog {
  event: "todoist_delivery_failed";
  itemType: TodoistItemType;
  itemId: number;
  todoistTaskId: string | null;
  error: string | undefined;
}

// Pure projection from a DeliveryResult to a structured backend log payload.
// Returns null for every outcome except "failed" — the counter response the
// caller already sends back over HTTP never carries `error`, so this is the
// only place the raw provider error text is retained, and only for the
// server's own logs.
export function buildDeliveryFailureLog(result: DeliveryResult): DeliveryFailureLog | null {
  if (result.outcome !== "failed") return null;
  return {
    event: "todoist_delivery_failed",
    itemType: result.itemType,
    itemId: result.itemId,
    todoistTaskId: result.todoistTaskId,
    error: result.error,
  };
}
