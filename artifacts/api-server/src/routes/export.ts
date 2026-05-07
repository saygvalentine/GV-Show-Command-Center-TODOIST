import { Router } from "express";
import { db, showsTable, tasksTable, eblastsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function toIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function toIcsDateEnd(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0].replace(/-/g, "");
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  parts.push(line.slice(0, 75));
  let i = 75;
  while (i < line.length) {
    parts.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join("\r\n");
}

router.get("/ics", async (req, res): Promise<void> => {
  const showId = req.query.showId ? Number(req.query.showId) : undefined;
  const mode = req.query.mode === "showdates" ? "showdates" : "tasks";

  const shows = showId
    ? await db.select().from(showsTable).where(eq(showsTable.id, showId))
    : await db.select().from(showsTable);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Show Command Center//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Show Command Center",
    "X-WR-TIMEZONE:UTC",
  ];

  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  if (mode === "showdates") {
    const showMilestones: Array<{ field: string; uid: string; label: string }> = [
      { field: "moveInDate",           uid: "movein",       label: "Move-In" },
      { field: "advanceWarehouseDate", uid: "advwarehouse", label: "Adv. Warehouse" },
      { field: "discountDeadline",     uid: "discount",     label: "Discount Deadline" },
      { field: "onlineOrderDeadline",  uid: "orderdeadline",label: "Online Order Deadline" },
      { field: "showStart",            uid: "showstart",    label: "Show Start" },
      { field: "dismantleDate",        uid: "dismantle",    label: "Dismantle" },
    ];

    for (const show of shows) {
      for (const milestone of showMilestones) {
        const date = (show as Record<string, unknown>)[milestone.field] as string | null;
        if (!date) continue;
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${milestone.uid}-${show.id}@showcommandcenter`);
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(`DTSTART;VALUE=DATE:${toIcsDate(date)}`);
        lines.push(`DTEND;VALUE=DATE:${toIcsDateEnd(date)}`);
        lines.push(foldLine(`SUMMARY:${escapeIcsText(show.name)} — ${milestone.label}`));
        lines.push(`CATEGORIES:${milestone.label}`);
        lines.push("END:VEVENT");
      }
    }
  } else {
    for (const show of shows) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:movein-${show.id}@showcommandcenter`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(show.moveInDate)}`);
      lines.push(`DTEND;VALUE=DATE:${toIcsDateEnd(show.moveInDate)}`);
      lines.push(foldLine(`SUMMARY:${escapeIcsText(show.name)} — Move-In`));
      lines.push("CATEGORIES:Move-In");
      lines.push("END:VEVENT");

      const tasks = await db.select().from(tasksTable).where(eq(tasksTable.showId, show.id));
      for (const task of tasks) {
        if (!task.dueDate) continue;
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:task-${task.id}@showcommandcenter`);
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(`DTSTART;VALUE=DATE:${toIcsDate(task.dueDate)}`);
        lines.push(`DTEND;VALUE=DATE:${toIcsDateEnd(task.dueDate)}`);
        lines.push(foldLine(`SUMMARY:${escapeIcsText(task.name)} [${escapeIcsText(show.name)}]`));
        const descParts: string[] = [];
        if (task.category) descParts.push(`Category: ${task.category}`);
        if (task.completed) descParts.push("Status: Completed");
        if (task.notes) descParts.push(`Notes: ${task.notes}`);
        if (descParts.length > 0) lines.push(foldLine(`DESCRIPTION:${escapeIcsText(descParts.join("\\n"))}`));
        lines.push(`STATUS:${task.completed ? "COMPLETED" : "CONFIRMED"}`);
        lines.push("CATEGORIES:Task");
        lines.push("END:VEVENT");
      }

      const eblasts = await db.select().from(eblastsTable).where(eq(eblastsTable.showId, show.id));
      for (const eblast of eblasts) {
        if (!eblast.dueDate) continue;
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:eblast-${eblast.id}@showcommandcenter`);
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(`DTSTART;VALUE=DATE:${toIcsDate(eblast.dueDate)}`);
        lines.push(`DTEND;VALUE=DATE:${toIcsDateEnd(eblast.dueDate)}`);
        lines.push(foldLine(`SUMMARY:✉ ${escapeIcsText(eblast.name)} [${escapeIcsText(show.name)}]`));
        const descParts: string[] = [];
        if (eblast.sent) descParts.push("Status: Sent");
        if (eblast.notes) descParts.push(`Notes: ${eblast.notes}`);
        if (descParts.length > 0) lines.push(foldLine(`DESCRIPTION:${escapeIcsText(descParts.join("\\n"))}`));
        lines.push(`STATUS:${eblast.sent ? "COMPLETED" : "CONFIRMED"}`);
        lines.push("CATEGORIES:e-Blast");
        lines.push("END:VEVENT");
      }
    }
  }

  lines.push("END:VCALENDAR");

  const showSuffix = showId && shows.length > 0 ? shows[0].name.replace(/[^a-z0-9]/gi, "_") : "all_shows";
  const modeSuffix = mode === "showdates" ? "show_dates_" : "";
  const filename = `show_command_center_${modeSuffix}${showSuffix}.ics`;

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(lines.join("\r\n"));
});

export default router;
