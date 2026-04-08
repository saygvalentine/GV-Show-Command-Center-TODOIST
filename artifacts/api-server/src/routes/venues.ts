import { Router } from "express";
import { db, venuesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res): Promise<void> => {
  const venues = await db.select().from(venuesTable).orderBy(venuesTable.name);
  res.json(venues);
});

router.post("/", async (req, res): Promise<void> => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 255) {
    res.status(400).json({ error: "Venue name is required and must be under 255 characters" });
    return;
  }

  const existing = await db
    .select()
    .from(venuesTable)
    .where(eq(venuesTable.name, name));

  if (existing.length > 0) {
    res.json(existing[0]);
    return;
  }

  const [venue] = await db
    .insert(venuesTable)
    .values({ name })
    .returning();

  res.status(201).json(venue);
});

router.delete("/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(venuesTable).where(eq(venuesTable.id, id));
  res.status(204).send();
});

export default router;
