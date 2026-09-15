import { describe, it, expect, vi } from "vitest";
import { deliverTask, deliverEblast, type DeliveryDeps } from "./delivery";

// Minimal fixtures matching the columns delivery.ts actually reads. No DB,
// no network, no Todoist connector is touched anywhere in this file — every
// Todoist/DB interaction goes through the injected `deps` mocks below.
function makeTask(overrides: Partial<Parameters<typeof deliverTask>[0]> = {}) {
  return {
    id: 1,
    showId: 10,
    name: "Submit To FM/EC",
    category: "Fire Marshal",
    dueDate: "2026-10-01",
    dueDateRule: null,
    completed: false,
    completedAt: null,
    notes: null,
    gcalEventId: null,
    todoistTaskId: null,
    createdAt: new Date(),
    ...overrides,
  } as Parameters<typeof deliverTask>[0];
}

function makeEblast(overrides: Partial<Parameters<typeof deliverEblast>[0]> = {}) {
  return {
    id: 2,
    showId: 10,
    name: "Send Discount Deadline eBlast",
    dueDate: "2026-10-01",
    dueDateRule: null,
    sent: false,
    sentAt: null,
    notes: null,
    gcalEventId: null,
    todoistTaskId: null,
    createdAt: new Date(),
    ...overrides,
  } as Parameters<typeof deliverEblast>[0];
}

function makeDeps(overrides: Partial<DeliveryDeps> = {}): DeliveryDeps {
  return {
    todoistRequest: vi.fn(),
    makeTodoistTask: (content, description, dueDate, projectId) => ({
      content,
      description,
      due_date: dueDate,
      ...(projectId ? { project_id: projectId } : {}),
    }),
    persistTodoistTaskId: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("deliverTask — create", () => {
  it("dated task without todoistTaskId: create succeeds, mapping persisted, outcome created", async () => {
    const request = vi
      .fn()
      // POST /api/v1/tasks -> create
      .mockResolvedValueOnce({ id: "TDST-1" })
      // POST /.../reopen (not completed)
      .mockResolvedValueOnce({});
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(makeTask(), "Test Show", "PROJ1", deps);

    expect(result.outcome).toBe("created");
    expect(result.todoistTaskId).toBe("TDST-1");
    expect(deps.persistTodoistTaskId).toHaveBeenCalledWith("task", 1, "TDST-1");
    expect(request).toHaveBeenNthCalledWith(1, "POST", "/api/v1/tasks", expect.objectContaining({ due_date: "2026-10-01" }));
  });
});

describe("deliverEblast — create", () => {
  it("dated e-blast without todoistTaskId: create succeeds, mapping persisted, outcome created", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: "TDST-2" })
      .mockResolvedValueOnce({});
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverEblast(makeEblast(), "Test Show", "PROJ2", deps);

    expect(result.outcome).toBe("created");
    expect(result.todoistTaskId).toBe("TDST-2");
    expect(deps.persistTodoistTaskId).toHaveBeenCalledWith("eblast", 2, "TDST-2");
  });
});

describe("update path", () => {
  it("dated item with existing todoistTaskId: update is sent, outcome updated", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: "TDST-1" }) // POST /tasks/:id -> update
      .mockResolvedValueOnce({}); // reopen
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(makeTask({ todoistTaskId: "TDST-1" }), "Test Show", "PROJ1", deps);

    expect(result.outcome).toBe("updated");
    expect(request).toHaveBeenNthCalledWith(1, "POST", "/api/v1/tasks/TDST-1", expect.anything());
    // No create call was made.
    expect(request).not.toHaveBeenCalledWith("POST", "/api/v1/tasks", expect.anything());
  });
});

describe("completion mapping", () => {
  it("completed task: upsert occurs, then Todoist close is called", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: "TDST-1" }) // create
      .mockResolvedValueOnce({}); // close
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(makeTask({ completed: true }), "Test Show", "PROJ1", deps);

    expect(result.completionAction).toBe("closed");
    expect(request).toHaveBeenNthCalledWith(2, "POST", "/api/v1/tasks/TDST-1/close");
  });

  it("sent e-blast: upsert occurs, then Todoist close is called", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: "TDST-2" })
      .mockResolvedValueOnce({});
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverEblast(makeEblast({ sent: true }), "Test Show", "PROJ2", deps);

    expect(result.completionAction).toBe("closed");
    expect(request).toHaveBeenNthCalledWith(2, "POST", "/api/v1/tasks/TDST-2/close");
  });

  it("reopened task: upsert occurs, then Todoist reopen is called", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: "TDST-1" }) // update
      .mockResolvedValueOnce({}); // reopen
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(
      makeTask({ todoistTaskId: "TDST-1", completed: false }),
      "Test Show",
      "PROJ1",
      deps,
    );

    expect(result.completionAction).toBe("reopened");
    expect(request).toHaveBeenNthCalledWith(2, "POST", "/api/v1/tasks/TDST-1/reopen");
  });

  it("unsent e-blast: upsert occurs, then Todoist reopen is called", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: "TDST-2" })
      .mockResolvedValueOnce({});
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverEblast(
      makeEblast({ todoistTaskId: "TDST-2", sent: false }),
      "Test Show",
      "PROJ2",
      deps,
    );

    expect(result.completionAction).toBe("reopened");
    expect(request).toHaveBeenNthCalledWith(2, "POST", "/api/v1/tasks/TDST-2/reopen");
  });
});

describe("undated items", () => {
  it("undated, unlinked item: no Todoist call, outcome skipped_no_due_date", async () => {
    const request = vi.fn();
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(makeTask({ dueDate: null, todoistTaskId: null }), "Test Show", "PROJ1", deps);

    expect(result.outcome).toBe("skipped_no_due_date");
    expect(request).not.toHaveBeenCalled();
    expect(deps.persistTodoistTaskId).not.toHaveBeenCalled();
  });

  it("undated, linked item: delete is called and local mapping is cleared", async () => {
    const request = vi.fn().mockResolvedValueOnce({});
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(
      makeTask({ dueDate: null, todoistTaskId: "TDST-1" }),
      "Test Show",
      "PROJ1",
      deps,
    );

    expect(result.outcome).toBe("deleted");
    expect(result.todoistTaskId).toBeNull();
    expect(request).toHaveBeenCalledWith("DELETE", "/api/v1/tasks/TDST-1");
    expect(deps.persistTodoistTaskId).toHaveBeenCalledWith("task", 1, null);
  });
});

describe("404 handling", () => {
  it("404 while updating a linked item: mapping cleared, no create afterward, outcome unlinked_remote_missing", async () => {
    // todoist-client.ts returns `null` for a 404 response (see todoistRequest).
    const request = vi.fn().mockResolvedValueOnce(null);
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(makeTask({ todoistTaskId: "TDST-1" }), "Test Show", "PROJ1", deps);

    expect(result.outcome).toBe("unlinked_remote_missing");
    expect(result.todoistTaskId).toBeNull();
    expect(deps.persistTodoistTaskId).toHaveBeenCalledWith("task", 1, null);
    // Exactly one Todoist call was made — no follow-up create.
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalledWith("POST", "/api/v1/tasks", expect.anything());
  });
});

describe("invalid create response", () => {
  it("create response without a valid id: not counted as created, no mapping persisted, outcome failed", async () => {
    const request = vi.fn().mockResolvedValueOnce({}); // no `id` field
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(makeTask(), "Test Show", "PROJ1", deps);

    expect(result.outcome).toBe("failed");
    expect(result.todoistTaskId).toBeNull();
    expect(deps.persistTodoistTaskId).not.toHaveBeenCalled();
  });
});

describe("non-429 failure", () => {
  it("surfaces the error as a typed outcome without corrupting the local mapping", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("Todoist API error 500: boom"));
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(makeTask({ todoistTaskId: "TDST-1" }), "Test Show", "PROJ1", deps);

    expect(result.outcome).toBe("failed");
    expect(result.error).toContain("500");
    // The pre-existing mapping is reported unchanged, and nothing was persisted.
    expect(result.todoistTaskId).toBe("TDST-1");
    expect(deps.persistTodoistTaskId).not.toHaveBeenCalled();
  });
});

describe("404 on completion (close/reopen)", () => {
  it("A. existing linked task: update succeeds, close returns null -> unlinked, no create", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: "TDST-1" }) // update body succeeds
      .mockResolvedValueOnce(null); // close 404s
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(
      makeTask({ todoistTaskId: "TDST-1", completed: true }),
      "Test Show",
      "PROJ1",
      deps,
    );

    expect(result.outcome).toBe("unlinked_remote_missing");
    expect(result.todoistTaskId).toBeNull();
    expect(result.completionAction).toBe("none");
    expect(deps.persistTodoistTaskId).toHaveBeenCalledWith("task", 1, null);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).not.toHaveBeenCalledWith("POST", "/api/v1/tasks", expect.anything());
  });

  it("B. existing linked e-blast: update succeeds, reopen returns null -> unlinked, no create", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: "TDST-2" }) // update body succeeds
      .mockResolvedValueOnce(null); // reopen 404s
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverEblast(
      makeEblast({ todoistTaskId: "TDST-2", sent: false }),
      "Test Show",
      "PROJ2",
      deps,
    );

    expect(result.outcome).toBe("unlinked_remote_missing");
    expect(result.todoistTaskId).toBeNull();
    expect(result.completionAction).toBe("none");
    expect(deps.persistTodoistTaskId).toHaveBeenCalledWith("eblast", 2, null);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).not.toHaveBeenCalledWith("POST", "/api/v1/tasks", expect.anything());
  });

  it("C. newly created completed task: create succeeds, close returns null -> mapping persisted then cleared, no second create", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: "TDST-3" }) // create succeeds
      .mockResolvedValueOnce(null); // close 404s
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(makeTask({ completed: true }), "Test Show", "PROJ1", deps);

    expect(result.outcome).toBe("unlinked_remote_missing");
    expect(result.todoistTaskId).toBeNull();
    expect(result.completionAction).toBe("none");
    // Persisted twice: once with the new id after create, once with null after the 404.
    expect(deps.persistTodoistTaskId).toHaveBeenNthCalledWith(1, "task", 1, "TDST-3");
    expect(deps.persistTodoistTaskId).toHaveBeenNthCalledWith(2, "task", 1, null);
    expect(request).toHaveBeenCalledTimes(2);
    // Only one create call was ever made.
    expect(request).toHaveBeenCalledWith("POST", "/api/v1/tasks", expect.anything());
    expect(
      request.mock.calls.filter(([, path]) => path === "/api/v1/tasks").length,
    ).toBe(1);
  });

  it("D. completion throws a non-404 error: outcome failed, prior mapping preserved, completionAction none", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: "TDST-1" }) // update body succeeds
      .mockRejectedValueOnce(new Error("Todoist API error 500: boom")); // close throws
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(
      makeTask({ todoistTaskId: "TDST-1", completed: true }),
      "Test Show",
      "PROJ1",
      deps,
    );

    expect(result.outcome).toBe("failed");
    expect(result.completionAction).toBe("none");
    expect(result.todoistTaskId).toBe("TDST-1");
    expect(result.error).toContain("500");
    // The mapping was never cleared or re-persisted for this failure.
    expect(deps.persistTodoistTaskId).not.toHaveBeenCalled();
  });

  it("E. undated linked item: DELETE returns null is treated as idempotent success", async () => {
    const request = vi.fn().mockResolvedValueOnce(null); // delete 404s — already gone
    const deps = makeDeps({ todoistRequest: request });

    const result = await deliverTask(
      makeTask({ dueDate: null, todoistTaskId: "TDST-1" }),
      "Test Show",
      "PROJ1",
      deps,
    );

    expect(result.outcome).toBe("deleted");
    expect(result.todoistTaskId).toBeNull();
    expect(deps.persistTodoistTaskId).toHaveBeenCalledWith("task", 1, null);
  });
});
