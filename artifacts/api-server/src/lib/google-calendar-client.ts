const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

export async function gcalRequest(
  method: string,
  path: string,
  token: string,
  calendarId: string,
  body?: unknown,
): Promise<unknown> {
  const actualPath = path.replace(
    "/calendars/primary/",
    `/calendars/${encodeURIComponent(calendarId)}/`,
  );

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${GCAL_BASE}${actualPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar API error ${response.status}: ${text}`);
  }
  if (response.status === 204) return {};
  return response.json();
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
