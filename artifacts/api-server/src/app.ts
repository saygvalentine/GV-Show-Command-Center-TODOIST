import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
  type ErrorRequestHandler,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// `express.json()`/`express.urlencoded()` tag a malformed-body error with
// `type === "entity.parse.failed"` (see body-parser's `lib/read.js`). Positioned here —
// after the parsers, before the API router — this only ever sees errors the parsers
// themselves raised (an error from inside the router propagates forward from a later
// position and never reaches back to this earlier layer), and it only claims that one
// specific error shape; anything else (including other body-parser errors, e.g. an
// unsupported charset) is passed on unchanged via `next(err)` to the generic handler
// below, app-wide, before requests are dispatched to `/api/*` — so every mounted route
// (including `/api/export/todoist/drain`) gets this same 400 instead of the generic 500.
const malformedBodyHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err && (err as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  next(err);
};
app.use(malformedBodyHandler);

app.use("/api", router);

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
