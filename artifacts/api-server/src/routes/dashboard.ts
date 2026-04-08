import { Router } from "express";
import { db, showsTable, tasksTable, eblastsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/summary", async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const shows = await db.select().from(showsTable).orderBy(showsTable.moveInDate);
  const allTasks = await db.select().from(tasksTable);
  const allEblasts = await db.select().from(eblastsTable);

  const activeShows = shows.filter((s) => s.moveInDate >= todayStr);
  const archivedShows = shows.filter((s) => s.moveInDate < todayStr);

  let totalOverdue = 0;
  for (const task of allTasks) {
    if (!task.completed && task.dueDate && task.dueDate < todayStr) {
      totalOverdue++;
    }
  }
  for (const eblast of allEblasts) {
    if (!eblast.sent && eblast.dueDate && eblast.dueDate < todayStr) {
      totalOverdue++;
    }
  }

  // Next up show (earliest active)
  let nextUpShow = null;
  if (activeShows.length > 0) {
    const show = activeShows[0];
    const tasks = allTasks.filter((t) => t.showId === show.id);
    const eblasts = allEblasts.filter((e) => e.showId === show.id);

    const overdueTasks = tasks.filter(
      (t) => !t.completed && t.dueDate && t.dueDate < todayStr
    );
    const overdueEblasts = eblasts.filter(
      (e) => !e.sent && e.dueDate && e.dueDate < todayStr
    );

    const sentEblasts = eblasts.filter((e) => e.sent).sort((a, b) => {
      if (!a.sentAt || !b.sentAt) return 0;
      return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
    });
    const lastEblast = sentEblasts[0];
    const oldestEblast = sentEblasts[sentEblasts.length - 1];

    const fireMarshalTasks = tasks.filter((t) => t.category === "Fire Marshal");
    let fireMarshalStatus = null;
    let fireMarshalDate = null;
    if (fireMarshalTasks.length > 0) {
      const allDone = fireMarshalTasks.every((t) => t.completed);
      fireMarshalStatus = allDone ? "Submitted" : "In Progress";
      if (allDone) {
        const lastDone = fireMarshalTasks.filter((t) => t.completedAt).sort(
          (a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
        )[0];
        fireMarshalDate = lastDone?.completedAt?.toISOString() ?? null;
      }
    }

    const idSignTasks = tasks.filter((t) => t.category === "ID Sign");
    let idSignStatus = null;
    if (idSignTasks.length > 0) {
      idSignStatus = idSignTasks.every((t) => t.completed) ? "Ordered" : "In Progress";
    }

    nextUpShow = {
      ...show,
      taskCount: tasks.length,
      completedTaskCount: tasks.filter((t) => t.completed).length,
      eblastCount: eblasts.length,
      sentEblastCount: sentEblasts.length,
      overdueCount: overdueTasks.length + overdueEblasts.length,
      lastEblastDate: lastEblast?.sentAt?.toISOString() ?? null,
      exhibitorKitSent: sentEblasts.length > 0,
      exhibitorKitDate: oldestEblast?.sentAt?.toISOString() ?? null,
      fireMarshalStatus,
      fireMarshalDate,
      idSignStatus,
    };
  }

  res.json({
    totalShows: shows.length,
    activeShows: activeShows.length,
    archivedShows: archivedShows.length,
    totalOverdue,
    nextUpShow,
  });
});

export default router;
