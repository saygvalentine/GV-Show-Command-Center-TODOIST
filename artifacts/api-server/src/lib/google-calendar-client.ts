import { ReplitConnectors, type ProxyOptions } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function gcalRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const options: ProxyOptions = { method };
  if (body !== undefined) {
    options.body = body;
    options.headers = { "Content-Type": "application/json" };
  }
  const response = await connectors.proxy("google-calendar", `/calendar/v3${path}`, options);

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
