import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const migrationsFolder = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../../lib/db/migrations",
);


async function runMigrations() {
  await migrate(db, { migrationsFolder });
  logger.info("Migrations applied");

  // Fix legacy category names stored in the database before the rename
  await db.execute(sql`
    UPDATE tasks SET category = 'Fire Marshal' WHERE category = 'Fire Marshal / Floor Plan'
  `);
  await db.execute(sql`
    UPDATE tasks SET category = 'ID Sign' WHERE category = 'ID Sign Production'
  `);
  logger.info("Startup complete");
}

runMigrations()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Migration failed, aborting startup");
    process.exit(1);
  });
