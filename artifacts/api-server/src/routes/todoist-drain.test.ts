import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { logger } from "../lib/logger";

// The worker itself is exhaustively covered against the real dev DB in worker.test.ts.
// This file only proves the route's own contract (kill switch, auth, validation,
// response/log shape) — the worker is always a mock here, so no real drain or Todoist
// call is ever reachable from this file.
vi.mock("../lib/todoist-sync/worker", () => ({
  drainTodoistOutbox: vi.fn(),
}));

import { drainTodoistOutbox } from "../lib/todoist-sync/worker";
import todoistDrainRouter from "./todoist-drain";
import mountedApp from "../app";

const TEST_TOKEN = "test-only-drain-token-do-not-reuse";
const EMPTY_SUMMARY = { claimed: 0, delivered: 0, requeued: 0, failed: 0, abandoned: 0, lostClaim: 0 };

let server: Server;
let baseUrl: string;

// The route module itself no longer parses its own body — body parsing (and the
// malformed-JSON -> 400 contract) is app.ts's job now, exercised separately below
// against the real, fully mounted `app`. This standalone harness only needs a plain
// `express.json()` to turn well-formed request bodies into `req.body`, exactly like
// `tasks.test.ts`'s own bare-router harness does for `tasksRouter`.
beforeAll(async () => {
  const standaloneApp = express();
  standaloneApp.use(express.json());
  standaloneApp.use("/export/todoist/drain", todoistDrainRouter);
  await new Promise<void>((resolve) => {
    server = standaloneApp.listen(0, () => resolve());
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

let originalEnabled: string | undefined;
let originalToken: string | undefined;

beforeEach(() => {
  originalEnabled = process.env.TODOIST_DRAIN_ENABLED;
  originalToken = process.env.TODOIST_DRAIN_TOKEN;
  vi.mocked(drainTodoistOutbox).mockReset();
});

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.TODOIST_DRAIN_ENABLED;
  else process.env.TODOIST_DRAIN_ENABLED = originalEnabled;
  if (originalToken === undefined) delete process.env.TODOIST_DRAIN_TOKEN;
  else process.env.TODOIST_DRAIN_TOKEN = originalToken;
});

function post(body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}/export/todoist/drain`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /export/todoist/drain — kill switch", () => {
  it("is disabled by default (env var unset) and never invokes the worker", async () => {
    delete process.env.TODOIST_DRAIN_ENABLED;

    const res = await post();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Todoist outbox drain is disabled" });
    expect(drainTodoistOutbox).not.toHaveBeenCalled();
  });

  it.each(["TRUE", "false", "1", "yes", " true", "true "])(
    "treats %j as disabled — only the exact string \"true\" enables dispatch",
    async (value) => {
      process.env.TODOIST_DRAIN_ENABLED = value;

      const res = await post();

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "Todoist outbox drain is disabled" });
      expect(drainTodoistOutbox).not.toHaveBeenCalled();
    },
  );
});

describe("POST /export/todoist/drain — auth", () => {
  beforeEach(() => {
    process.env.TODOIST_DRAIN_ENABLED = "true";
  });

  it("returns 503 and never invokes the worker when enabled but no token is configured", async () => {
    delete process.env.TODOIST_DRAIN_TOKEN;

    const res = await post(undefined, { "X-Todoist-Drain-Token": "anything" });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Todoist outbox drain is unavailable" });
    expect(drainTodoistOutbox).not.toHaveBeenCalled();
  });

  it("returns 503 and never invokes the worker when the configured token is an empty string", async () => {
    process.env.TODOIST_DRAIN_TOKEN = "";

    const res = await post(undefined, { "X-Todoist-Drain-Token": "anything" });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Todoist outbox drain is unavailable" });
    expect(drainTodoistOutbox).not.toHaveBeenCalled();
  });

  it("returns 401 and never invokes the worker when the token header is missing", async () => {
    process.env.TODOIST_DRAIN_TOKEN = TEST_TOKEN;

    const res = await post();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(drainTodoistOutbox).not.toHaveBeenCalled();
  });

  it("returns 401 and never invokes the worker when the token header is wrong", async () => {
    process.env.TODOIST_DRAIN_TOKEN = TEST_TOKEN;

    const res = await post(undefined, { "X-Todoist-Drain-Token": "definitely-wrong" });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(drainTodoistOutbox).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong token of a different length than the configured one", async () => {
    process.env.TODOIST_DRAIN_TOKEN = TEST_TOKEN;

    const res = await post(undefined, { "X-Todoist-Drain-Token": "short" });

    expect(res.status).toBe(401);
    expect(drainTodoistOutbox).not.toHaveBeenCalled();
  });
});

describe("POST /export/todoist/drain — success", () => {
  beforeEach(() => {
    process.env.TODOIST_DRAIN_ENABLED = "true";
    process.env.TODOIST_DRAIN_TOKEN = TEST_TOKEN;
  });

  it("invokes the worker exactly once with default bounded options and returns the exact summary", async () => {
    const summary = { claimed: 2, delivered: 1, requeued: 0, failed: 1, abandoned: 0, lostClaim: 0 };
    vi.mocked(drainTodoistOutbox).mockResolvedValueOnce(summary);

    const res = await post(undefined, { "X-Todoist-Drain-Token": TEST_TOKEN });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(summary);
    expect(drainTodoistOutbox).toHaveBeenCalledTimes(1);
    expect(drainTodoistOutbox).toHaveBeenCalledWith({ batchSize: 10, maxRuntimeMs: 20000, concurrency: 3 });
  });

  it("invokes the worker with valid custom options within limits", async () => {
    vi.mocked(drainTodoistOutbox).mockResolvedValueOnce(EMPTY_SUMMARY);

    const res = await post({ batchSize: 5, maxRuntimeMs: 1000 }, { "X-Todoist-Drain-Token": TEST_TOKEN });

    expect(res.status).toBe(200);
    expect(drainTodoistOutbox).toHaveBeenCalledTimes(1);
    expect(drainTodoistOutbox).toHaveBeenCalledWith({ batchSize: 5, maxRuntimeMs: 1000, concurrency: 3 });
  });

  it.each([
    // A bare JSON string/number/boolean at the top level fails body-parser's own default
    // strict mode (only `{`/`[` are accepted) before ever reaching this route's own
    // validation — that's the same "entity.parse.failed" family as malformed JSON,
    // already covered by the fully-mounted-app tests below. An array is the one
    // non-object shape that *does* parse successfully, exercising this route's own
    // `isPlainObject` rejection instead of body-parser's.
    ["a non-object (array) body", ["not", "an", "object"]],
    ["an unknown field", { batchSize: 5, extra: true }],
    ["a non-integer batchSize", { batchSize: 5.5 }],
    ["a zero batchSize", { batchSize: 0 }],
    ["a negative batchSize", { batchSize: -1 }],
    ["a zero maxRuntimeMs", { maxRuntimeMs: 0 }],
    ["a negative maxRuntimeMs", { maxRuntimeMs: -1 }],
    ["a batchSize above the ceiling", { batchSize: 21 }],
    ["a maxRuntimeMs above the ceiling", { maxRuntimeMs: 20001 }],
  ])("rejects %s with 400 and never invokes the worker", async (_label, body) => {
    const res = await post(body, { "X-Todoist-Drain-Token": TEST_TOKEN });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid drain options" });
    expect(drainTodoistOutbox).not.toHaveBeenCalled();
  });

  it("returns a generic 500, logs the failure event, and never exposes the raw error when the worker throws", async () => {
    vi.mocked(drainTodoistOutbox).mockRejectedValueOnce(new Error("db connection lost: internal-detail-xyz"));
    const errorSpy = vi.spyOn(logger, "error");

    const res = await post(undefined, { "X-Todoist-Drain-Token": TEST_TOKEN });
    const bodyText = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(bodyText)).toEqual({ error: "Internal server error" });
    expect(bodyText).not.toContain("internal-detail-xyz");
    expect(
      errorSpy.mock.calls.some(([payload]) => (payload as Record<string, unknown>)?.event === "todoist_outbox_drain_failed"),
    ).toBe(true);

    errorSpy.mockRestore();
  });
});

describe("POST /export/todoist/drain — token confidentiality", () => {
  beforeEach(() => {
    process.env.TODOIST_DRAIN_ENABLED = "true";
    process.env.TODOIST_DRAIN_TOKEN = TEST_TOKEN;
  });

  it("never echoes the configured or supplied token into the response body or a log call", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    const errorSpy = vi.spyOn(logger, "error");
    const wrongToken = "wrong-token-value-abc123";

    const res = await post(undefined, { "X-Todoist-Drain-Token": wrongToken });
    const bodyText = await res.text();

    expect(res.status).toBe(401);
    expect(bodyText).not.toContain(TEST_TOKEN);
    expect(bodyText).not.toContain(wrongToken);

    const loggedText = JSON.stringify([...infoSpy.mock.calls, ...errorSpy.mock.calls]);
    expect(loggedText).not.toContain(TEST_TOKEN);
    expect(loggedText).not.toContain(wrongToken);

    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("fully mounted app — /api/export/todoist/drain", () => {
  // Imports the real `app` from `app.ts` (not a bare router reconstruction), so this
  // exercises the actual production middleware chain: pino-http, cors, express.json(),
  // the app-level malformed-body handler, the real assembled router, and the generic
  // error handler — exactly what a real request hits.
  let mountedServer: Server;
  let mountedBaseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      mountedServer = mountedApp.listen(0, () => resolve());
    });
    const address = mountedServer.address();
    const port = typeof address === "object" && address ? address.port : 0;
    mountedBaseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      mountedServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("is reachable (not 404) at POST /api/export/todoist/drain", async () => {
    delete process.env.TODOIST_DRAIN_ENABLED;

    const res = await fetch(`${mountedBaseUrl}/api/export/todoist/drain`, { method: "POST" });

    expect(res.status).toBe(503);
  });

  it("does not respond to GET on the drain path", async () => {
    const res = await fetch(`${mountedBaseUrl}/api/export/todoist/drain`, { method: "GET" });
    expect(res.status).toBe(404);
  });

  it("does not respond at an unintended sibling path", async () => {
    const res = await fetch(`${mountedBaseUrl}/api/export/todoist/drainx`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("returns 400 { error: \"Invalid JSON body\" } for malformed JSON in the fully mounted app, and never invokes the worker", async () => {
    process.env.TODOIST_DRAIN_ENABLED = "true";
    process.env.TODOIST_DRAIN_TOKEN = TEST_TOKEN;

    const res = await fetch(`${mountedBaseUrl}/api/export/todoist/drain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Todoist-Drain-Token": TEST_TOKEN },
      body: "{not valid json",
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(drainTodoistOutbox).not.toHaveBeenCalled();
  });

  // A body-parser error that is NOT "entity.parse.failed" (an unsupported charset, which
  // express.json() rejects before ever attempting JSON.parse — see body-parser's
  // lib/types/json.js `isValidCharset` check) proves app.ts's new handler discriminates
  // rather than blanket-catching every parser error: this one must fall through, via
  // `next(err)`, to the existing generic 500 handler, unchanged.
  it("still returns the generic 500 for a non-JSON-syntax parser error (unsupported charset), proving unrelated errors are not swallowed", async () => {
    delete process.env.TODOIST_DRAIN_ENABLED;

    const res = await fetch(`${mountedBaseUrl}/api/export/todoist/drain`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=iso-8859-1" },
      body: "{}",
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(drainTodoistOutbox).not.toHaveBeenCalled();
  });
});
