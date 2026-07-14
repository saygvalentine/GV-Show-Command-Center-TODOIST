import { Router } from "express";
import { db, showsTable, tasksTable, eblastsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
const router = Router();

function daysOverdueCount(dueDateStr: string, todayMs: number): number {
  return Math.floor((todayMs - new Date(dueDateStr).getTime()) / 86400000);
}

router.get("/overdue", async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const shows = await db.select().from(showsTable);
  const allTasks = await db.select().from(tasksTable);
  const allEblasts = await db.select().from(eblastsTable);

  const showMap = Object.fromEntries(shows.map((s) => {
    const showTasks = allTasks.filter((t) => t.showId === s.id);
    const fmDeadlineTask = showTasks.find((t) => t.name === "Hard Deadline" && t.category === "Fire Marshal");
    const idSignDeadlineTask = showTasks.find((t) => t.name === "ID Sign Deadline" && t.category === "ID Sign");
    const bucketDueDateTask = showTasks.find((t) => t.name === "Bucket Due Date" && t.category === "Show Bucket");
    return [s.id, {
      name: s.name,
      moveInDate: s.moveInDate,
      fmDeadlineDate: fmDeadlineTask?.dueDate ?? null,
      idSignDeadlineDate: idSignDeadlineTask?.dueDate ?? null,
      bucketDueDate: bucketDueDateTask?.dueDate ?? null,
      advanceWarehouseDate: s.advanceWarehouseDate ?? null,
      onlineOrderDeadline: s.onlineOrderDeadline ?? null,
      discountDeadline: s.discountDeadline ?? null,
    }];
  }));

  const items: {
    id: number;
    type: "task" | "eblast";
    showId: number;
    showName: string;
    name: string;
    dueDate: string;
    category: string | null;
    daysOverdue: number;
    notes: string | null;
    moveInDate: string | null;
    fmDeadlineDate: string | null;
    idSignDeadlineDate: string | null;
    bucketDueDate: string | null;
    advanceWarehouseDate: string | null;
    onlineOrderDeadline: string | null;
    discountDeadline: string | null;
  }[] = [];

  for (const task of allTasks) {
    if (!task.completed && task.dueDate && task.dueDate <= todayStr) {
      items.push({
        id: task.id,
        type: "task",
        showId: task.showId,
        showName: showMap[task.showId]?.name ?? "Unknown Show",
        name: task.name,
        dueDate: task.dueDate,
        category: task.category ?? null,
        daysOverdue: daysOverdueCount(task.dueDate, today.getTime()),
        notes: task.notes ?? null,
        moveInDate: showMap[task.showId]?.moveInDate ?? null,
        fmDeadlineDate: showMap[task.showId]?.fmDeadlineDate ?? null,
        idSignDeadlineDate: showMap[task.showId]?.idSignDeadlineDate ?? null,
        bucketDueDate: showMap[task.showId]?.bucketDueDate ?? null,
        advanceWarehouseDate: showMap[task.showId]?.advanceWarehouseDate ?? null,
        onlineOrderDeadline: showMap[task.showId]?.onlineOrderDeadline ?? null,
        discountDeadline: showMap[task.showId]?.discountDeadline ?? null,
      });
    }
  }

  for (const eblast of allEblasts) {
    if (!eblast.sent && eblast.dueDate && eblast.dueDate <= todayStr) {
      items.push({
        id: eblast.id,
        type: "eblast",
        showId: eblast.showId,
        showName: showMap[eblast.showId]?.name ?? "Unknown Show",
        name: eblast.name,
        dueDate: eblast.dueDate,
        category: null,
        daysOverdue: daysOverdueCount(eblast.dueDate, today.getTime()),
        notes: null,
        moveInDate: showMap[eblast.showId]?.moveInDate ?? null,
        fmDeadlineDate: showMap[eblast.showId]?.fmDeadlineDate ?? null,
        idSignDeadlineDate: showMap[eblast.showId]?.idSignDeadlineDate ?? null,
        bucketDueDate: showMap[eblast.showId]?.bucketDueDate ?? null,
        advanceWarehouseDate: showMap[eblast.showId]?.advanceWarehouseDate ?? null,
        onlineOrderDeadline: showMap[eblast.showId]?.onlineOrderDeadline ?? null,
        discountDeadline: showMap[eblast.showId]?.discountDeadline ?? null,
      });
    }
  }

  items.sort((a, b) => b.daysOverdue - a.daysOverdue);

  res.json(items);
});

router.get("/summary", async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const shows = await db.select().from(showsTable).orderBy(showsTable.moveInDate);
  const allTasks = await db.select().from(tasksTable);
  const allEblasts = await db.select().from(eblastsTable);

  const activeShows = shows.filter((s) => (s.dismantleDate ?? s.moveInDate) >= todayStr);
  const archivedShows = shows.filter((s) => (s.dismantleDate ?? s.moveInDate) < todayStr);

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
      const keyFmTask = fireMarshalTasks.find((t) => t.name === "Submit To FM/EC");
      if (keyFmTask?.completed) {
        fireMarshalStatus = "Submitted";
        fireMarshalDate = keyFmTask.completedAt?.toISOString() ?? null;
      } else {
        fireMarshalStatus = "In Progress";
      }
    }

    const idSignTasks = tasks.filter((t) => t.category === "ID Sign");
    let idSignStatus = null;
    let idSignDate = null;
    if (idSignTasks.length > 0) {
      const keyIdTask = idSignTasks.find((t) => t.name === "Submit ID Sign Order");
      if (keyIdTask?.completed) {
        idSignStatus = "Ordered";
        idSignDate = keyIdTask.completedAt?.toISOString() ?? null;
      } else {
        idSignStatus = "In Progress";
      }
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
      idSignDate,
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
