import { Router } from "express";
import { db, linksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateLinkBody,
  CreateLinkParams,
  DeleteLinkParams,
  ListLinksParams,
} from "@workspace/api-zod";

const router = Router({ mergeParams: true });

router.get("/", async (req, res): Promise<void> => {
  const params = ListLinksParams.safeParse({ showId: Number(req.params.showId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid show ID" });
    return;
  }

  const links = await db
    .select()
    .from(linksTable)
    .where(eq(linksTable.showId, params.data.showId))
    .orderBy(linksTable.createdAt);

  res.json(links);
});

router.post("/", async (req, res): Promise<void> => {
  const params = CreateLinkParams.safeParse({ showId: Number(req.params.showId) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid show ID" });
    return;
  }

  const parsed = CreateLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [link] = await db
    .insert(linksTable)
    .values({ ...parsed.data, showId: params.data.showId })
    .returning();

  res.status(201).json(link);
});

router.delete("/:linkId", async (req, res): Promise<void> => {
  const params = DeleteLinkParams.safeParse({
    showId: Number(req.params.showId),
    linkId: Number(req.params.linkId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  await db
    .delete(linksTable)
    .where(
      and(
        eq(linksTable.id, params.data.linkId),
        eq(linksTable.showId, params.data.showId)
      )
    );

  res.status(204).send();
});

export default router;
