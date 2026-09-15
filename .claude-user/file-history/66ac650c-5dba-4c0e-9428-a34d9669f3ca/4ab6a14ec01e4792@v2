import { db, tasksTable, eblastsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { todoistRequest, makeTodoistTask } from "../todoist-client";
import type { CompletionAction, DeliveryResult, TodoistItemType } from "./types";

type TodoistTaskResponse = { id: string };

export interface DeliveryDeps {
  todoistRequest: (method: string, path: string, body?: unknown) => Promise<unknown>;
  makeTodoistTask: (content: string, description: string, dueDate: string, projectId?: string) => object;
  persistTodoistTaskId: (
    itemType: TodoistItemType,
    itemId: number,
    todoistTaskId: string | null,
  ) => Promise<void>;
}

async function persistTodoistTaskIdReal(
  itemType: TodoistItemType,
  itemId: number,
  todoistTaskId: string | null,
): Promise<void> {
  if (itemType === "task") {
    await db.update(tasksTable).set({ todoistTaskId }).where(eq(tasksTable.id, itemId));
  } else {
    await db.update(eblastsTable).set({ todoistTaskId }).where(eq(eblastsTable.id, itemId));
  }
}

export const defaultDeliveryDeps: DeliveryDeps = {
  todoistRequest,
  makeTodoistTask,
  persistTodoistTaskId: persistTodoistTaskIdReal,
};

interface DeliverableItem {
  itemType: TodoistItemType;
  id: number;
  dueDate: string | null;
  todoistTaskId: string | null;
  // Task -> completed, E-blast -> sent. Same close/reopen semantics either way.
  isDone: boolean;
}

async function setCompletion(
  deps: DeliveryDeps,
  todoistTaskId: string,
  isDone: boolean,
): Promise<void> {
  await deps.todoistRequest("POST", `/api/v1/tasks/${todoistTaskId}/${isDone ? "close" : "reopen"}`);
}

async function deliverCore(
  item: DeliverableItem,
  content: string,
  description: string,
  projectId: string,
  deps: DeliveryDeps,
): Promise<DeliveryResult> {
  const base = { itemType: item.itemType, itemId: item.id };

  if (!item.dueDate) {
    if (!item.todoistTaskId) {
      return { ...base, outcome: "skipped_no_due_date", todoistTaskId: null, completionAction: "none" };
    }
    try {
      await deps.todoistRequest("DELETE", `/api/v1/tasks/${item.todoistTaskId}`);
    } catch (err) {
      return {
        ...base,
        outcome: "failed",
        todoistTaskId: item.todoistTaskId,
        completionAction: "none",
        error: (err as Error).message,
      };
    }
    await deps.persistTodoistTaskId(item.itemType, item.id, null);
    return { ...base, outcome: "deleted", todoistTaskId: null, completionAction: "none" };
  }

  const body = deps.makeTodoistTask(content, description, item.dueDate, projectId);

  // Update path: item already has a remote mapping.
  if (item.todoistTaskId) {
    let updateResult: unknown;
    try {
      updateResult = await deps.todoistRequest("POST", `/api/v1/tasks/${item.todoistTaskId}`, body);
    } catch (err) {
      return {
        ...base,
        outcome: "failed",
        todoistTaskId: item.todoistTaskId,
        completionAction: "none",
        error: (err as Error).message,
      };
    }

    if (updateResult === null) {
      // 404: the remote task is gone. Clear the local mapping and stop —
      // do not recreate in this same delivery attempt (Phase 2 policy).
      await deps.persistTodoistTaskId(item.itemType, item.id, null);
      return { ...base, outcome: "unlinked_remote_missing", todoistTaskId: null, completionAction: "none" };
    }

    let completionAction: CompletionAction = "none";
    try {
      await setCompletion(deps, item.todoistTaskId, item.isDone);
      completionAction = item.isDone ? "closed" : "reopened";
    } catch (err) {
      return {
        ...base,
        outcome: "failed",
        todoistTaskId: item.todoistTaskId,
        completionAction: "none",
        error: (err as Error).message,
      };
    }

    return { ...base, outcome: "updated", todoistTaskId: item.todoistTaskId, completionAction };
  }

  // Create path: no existing remote mapping.
  let created: TodoistTaskResponse | null;
  try {
    created = (await deps.todoistRequest("POST", "/api/v1/tasks", body)) as TodoistTaskResponse | null;
  } catch (err) {
    return {
      ...base,
      outcome: "failed",
      todoistTaskId: null,
      completionAction: "none",
      error: (err as Error).message,
    };
  }

  if (!created?.id) {
    // Todoist responded without a usable id — do not claim success and do
    // not persist an empty/false mapping.
    return {
      ...base,
      outcome: "failed",
      todoistTaskId: null,
      completionAction: "none",
      error: "Todoist create response did not include a valid task id",
    };
  }

  const newTodoistTaskId = created.id;
  await deps.persistTodoistTaskId(item.itemType, item.id, newTodoistTaskId);

  let completionAction: CompletionAction = "none";
  try {
    await setCompletion(deps, newTodoistTaskId, item.isDone);
    completionAction = item.isDone ? "closed" : "reopened";
  } catch (err) {
    // The task was created and the mapping is already persisted — creation
    // itself succeeded. A failed close/reopen call is reported via
    // completionAction staying "none"; the outcome remains "created" since
    // that part of the work genuinely succeeded.
    return {
      ...base,
      outcome: "created",
      todoistTaskId: newTodoistTaskId,
      completionAction: "none",
      error: (err as Error).message,
    };
  }

  return { ...base, outcome: "created", todoistTaskId: newTodoistTaskId, completionAction };
}

export async function deliverTask(
  task: typeof tasksTable.$inferSelect,
  showName: string,
  projectId: string,
  deps: DeliveryDeps = defaultDeliveryDeps,
): Promise<DeliveryResult> {
  const content = `${task.name} [${showName}]`;
  const descParts = [`Show: ${showName}`];
  if (task.category) descParts.push(`Category: ${task.category}`);
  if (task.notes) descParts.push(`Notes: ${task.notes}`);

  return deliverCore(
    {
      itemType: "task",
      id: task.id,
      dueDate: task.dueDate,
      todoistTaskId: task.todoistTaskId,
      isDone: task.completed,
    },
    content,
    descParts.join("\n"),
    projectId,
    deps,
  );
}

export async function deliverEblast(
  eblast: typeof eblastsTable.$inferSelect,
  showName: string,
  projectId: string,
  deps: DeliveryDeps = defaultDeliveryDeps,
): Promise<DeliveryResult> {
  const content = `✉ ${eblast.name} [${showName}]`;
  const descParts = [`Show: ${showName}`, "Type: e-Blast"];
  if (eblast.notes) descParts.push(`Notes: ${eblast.notes}`);

  return deliverCore(
    {
      itemType: "eblast",
      id: eblast.id,
      dueDate: eblast.dueDate,
      todoistTaskId: eblast.todoistTaskId,
      isDone: eblast.sent,
    },
    content,
    descParts.join("\n"),
    projectId,
    deps,
  );
}
