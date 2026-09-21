import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { drainTodoistOutbox, type DrainSummary } from "../lib/todoist-sync/worker";
import { logger } from "../lib/logger";

// Disabled-by-default, token-protected, request-triggered drain trigger for the Phase
// 3A.2 outbox worker (`drainTodoistOutbox`). No cron/timer/startup hook calls this route
// or the worker — see CLAUDE.md's Phase 3A.3 section for the operational contract.
//
// Body parsing — including turning a malformed body into a 400 — is handled once,
// app-wide, in `app.ts`, before any request reaches this router. This handler relies on
// `req.body` already being parsed, exactly like every other route module in this repo.
const router = Router();

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 20;
const DEFAULT_MAX_RUNTIME_MS = 20_000;
const MAX_MAX_RUNTIME_MS = 20_000;
const DRAIN_CONCURRENCY = 3;
const ALLOWED_BODY_KEYS = new Set(["batchSize", "maxRuntimeMs"]);

interface DrainRequestOptions {
  batchSize: number;
  maxRuntimeMs: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Rejects out-of-range/malformed input rather than clamping it, so a caller's request
// always either ran with the options it asked for or was told exactly why it didn't.
function parseDrainOptions(body: unknown): DrainRequestOptions | null {
  if (body === undefined || body === null) {
    return { batchSize: DEFAULT_BATCH_SIZE, maxRuntimeMs: DEFAULT_MAX_RUNTIME_MS };
  }
  if (!isPlainObject(body)) return null;

  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) return null;
  }

  let batchSize = DEFAULT_BATCH_SIZE;
  if (body.batchSize !== undefined) {
    if (!isPositiveInteger(body.batchSize) || body.batchSize > MAX_BATCH_SIZE) return null;
    batchSize = body.batchSize;
  }

  let maxRuntimeMs = DEFAULT_MAX_RUNTIME_MS;
  if (body.maxRuntimeMs !== undefined) {
    if (!isPositiveInteger(body.maxRuntimeMs) || body.maxRuntimeMs > MAX_MAX_RUNTIME_MS) return null;
    maxRuntimeMs = body.maxRuntimeMs;
  }

  return { batchSize, maxRuntimeMs };
}

// `timingSafeEqual` throws on mismatched buffer lengths, so the length check must happen
// first — an unequal-length supplied token is rejected without ever reaching the
// constant-time comparison, and without ever throwing.
function tokensMatch(configured: string, supplied: string): boolean {
  const configuredBuf = Buffer.from(configured);
  const suppliedBuf = Buffer.from(supplied);
  if (configuredBuf.length !== suppliedBuf.length) return false;
  return timingSafeEqual(configuredBuf, suppliedBuf);
}

function getRequestId(req: Request): string | undefined {
  // pino-http assigns `req.id` on the underlying request in the real mounted app; plain
  // Express types don't declare it, and it's simply absent in isolated router tests.
  return (req as unknown as { id?: string }).id;
}

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const requestId = getRequestId(req);

  if (process.env.TODOIST_DRAIN_ENABLED !== "true") {
    res.status(503).json({ error: "Todoist outbox drain is disabled" });
    return;
  }

  const configuredToken = process.env.TODOIST_DRAIN_TOKEN;
  if (!configuredToken) {
    logger.error(
      { event: "todoist_outbox_drain_misconfigured", requestId },
      "todoist_outbox_drain_misconfigured",
    );
    res.status(503).json({ error: "Todoist outbox drain is unavailable" });
    return;
  }

  const suppliedToken = req.get("X-Todoist-Drain-Token");
  if (!suppliedToken || !tokensMatch(configuredToken, suppliedToken)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const options = parseDrainOptions(req.body);
  if (!options) {
    res.status(400).json({ error: "Invalid drain options" });
    return;
  }

  const startedAt = Date.now();
  try {
    const summary: DrainSummary = await drainTodoistOutbox({
      batchSize: options.batchSize,
      maxRuntimeMs: options.maxRuntimeMs,
      concurrency: DRAIN_CONCURRENCY,
    });

    logger.info(
      {
        event: "todoist_outbox_drain_summary",
        requestId,
        batchSize: options.batchSize,
        maxRuntimeMs: options.maxRuntimeMs,
        elapsedMs: Date.now() - startedAt,
        ...summary,
      },
      "todoist_outbox_drain_summary",
    );

    res.status(200).json(summary);
  } catch (err) {
    logger.error(
      {
        event: "todoist_outbox_drain_failed",
        requestId,
        batchSize: options.batchSize,
        maxRuntimeMs: options.maxRuntimeMs,
        elapsedMs: Date.now() - startedAt,
        err,
      },
      "todoist_outbox_drain_failed",
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
