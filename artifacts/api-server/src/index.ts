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

async function seedPresetTasks() {
  const count = await db.execute(sql`SELECT COUNT(*) AS c FROM preset_tasks`);
  const existing = Number((count.rows[0] as { c: string }).c);
  if (existing > 0) return;

  await db.execute(sql`
    INSERT INTO preset_tasks (name, category, due_date_offset, due_date_unit, due_date_direction, due_date_anchor) VALUES
      ('Initial Contact Account Executive', 'Fire Marshal', 60, 'cal', 'before', 'moveInDate'),
      ('Submit To FM/EC', 'Fire Marshal', 30, 'biz', 'before', 'moveInDate'),
      ('Hard Deadline', 'Fire Marshal', 30, 'cal', 'before', 'moveInDate'),
      ('Contact Client / Give Deadline', 'ID Sign', 30, 'cal', 'before', 'moveInDate'),
      ('ID Sign Deadline', 'ID Sign', 12, 'biz', 'before', 'moveInDate'),
      ('Submit Order', 'ID Sign', 8, 'biz', 'before', 'moveInDate'),
      ('Contact Declared but Not Received', 'Warehouse Manifest', 3, 'biz', 'before', 'advanceWarehouseDate'),
      ('Get Bucket Due Dates & Quantities', 'Show Bucket', 10, 'biz', 'before', 'moveInDate'),
      ('Create Carpet Plan', 'Show Bucket', 1, 'cal', 'after', 'onlineOrderDeadline'),
      ('Add CC Tags to XBR List', 'Show Bucket', 5, 'biz', 'before', 'moveInDate'),
      ('Finalize Carpet Plan', 'Show Bucket', 5, 'biz', 'before', 'moveInDate'),
      ('Begin Bucket Creation', 'Show Bucket', 5, 'biz', 'before', 'moveInDate'),
      ('Bucket Due Date', 'Show Bucket', NULL, NULL, NULL, NULL),
      ('Send e-Blast for A.E. Vehicle Spotting', 'Vehicle Spotting', 60, 'cal', 'before', 'moveInDate'),
      ('Check Vehicle Spotting / Provide To Beau', 'Vehicle Spotting', 40, 'cal', 'before', 'moveInDate'),
      ('Check Vehicle Spotting / Provide To Beau 2', 'Vehicle Spotting', 30, 'biz', 'before', 'moveInDate'),
      ('Contact Electrical Provider', 'Electrical', 1, 'cal', 'after', 'onlineOrderDeadline')
  `);
  logger.info("Preset tasks seeded");
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

  await seedPresetTasks();

  // Fix legacy category names stored in the database before the rename
  await db.execute(sql`
    UPDATE tasks SET category = 'Fire Marshal' WHERE category = 'Fire Marshal / Floor Plan'
  `);
  await db.execute(sql`
    UPDATE tasks SET category = 'ID Sign' WHERE category = 'ID Sign Production'
  `);
  // Fix preset task name mismatch: seed used 'Check In / Submit' but key-task
  // detection in shows/dashboard routes expects 'Submit To FM/EC'
  await db.execute(sql`
    UPDATE preset_tasks SET name = 'Submit To FM/EC' WHERE name = 'Check In / Submit' AND category = 'Fire Marshal'
  `);
  await db.execute(sql`
    UPDATE tasks SET name = 'Submit To FM/EC' WHERE name = 'Check In / Submit' AND category = 'Fire Marshal'
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
