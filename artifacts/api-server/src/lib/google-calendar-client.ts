import { ReplitConnectors } from "@replit/connectors-sdk";

// @replit/connectors-sdk — Google Calendar integration handles OAuth automatically
const connectors = new ReplitConnectors();

export async function gcalRequest(
  method: string,
  path: string,
  calendarId: string,
  body?: unknown,
): Promise<unknown> {
  const actualPath = `/calendar/v3${path}`.replace(
    "/calendars/primary/",
    `/calendars/${encodeURIComponent(calendarId)}/`,
  );

  const response = await connectors.proxy("google-calendar", actualPath, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });

  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar API error ${response.status}: ${text}`);
  }
  if (response.status === 204) return {};
  return response.json();
}

export async function gcalListCalendars(): Promise<{ id: string; summary: string; primary?: boolean }[]> {
  const response = await connectors.proxy(
    "google-calendar",
    "/calendar/v3/users/me/calendarList?minAccessRole=writer",
    { method: "GET" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar API error ${response.status}: ${text}`);
  }
  const data = await response.json() as { items?: { id: string; summary: string; primary?: boolean }[] };
  return data.items ?? [];
}

export function makeGcalEvent(
  summary: string,
  dateStr: string,
  description: string,
): object {
  const end = new Date(dateStr + "T00:00:00");
  end.setDate(end.getDate() + 1);
  const endStr = end.toISOString().split("T")[0];
  return {
    summary,
    description,
    start: { date: dateStr },
    end: { date: endStr },
  };
}
