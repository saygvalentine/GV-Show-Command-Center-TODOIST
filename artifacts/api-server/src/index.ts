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


async function schemaAlreadyExists(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'shows'
    ) AS "exists"
  `);
  return result.rows[0]?.exists === true;
}

async function runMigrations() {
  const alreadyBootstrapped = await schemaAlreadyExists();
  if (alreadyBootstrapped) {
    logger.info(
      "Schema already exists — skipping migrate() to avoid re-applying applied migrations.",
    );
  } else {
    await migrate(db, { migrationsFolder });
    logger.info("Migrations applied");
  }

  // Fix legacy category names stored in the database before the rename
  await db.execute(sql`
    UPDATE tasks SET category = 'Fire Marshal' WHERE category = 'Fire Marshal / Floor Plan'
  `);
  await db.execute(sql`
    UPDATE tasks SET category = 'ID Sign' WHERE category = 'ID Sign Production'
  `);
  logger.info("Startup complete");
}

// Start listening immediately so Replit's health probe (/api/healthz) passes
// before the DB connection is established. Migrations run right after.
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  runMigrations().catch((err) => {
    logger.error({ err }, "Migration failed");
    process.exit(1);
  });
});
