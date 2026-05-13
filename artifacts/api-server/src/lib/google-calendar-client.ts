const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

export async function getGoogleCalendarToken(): Promise<string> {
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const identity = process.env["REPL_IDENTITY"];
  const connectionId = process.env["GOOGLE_CALENDAR_CONNECTION_ID"];

  if (!hostname || !identity || !connectionId) {
    throw new Error(
      "Google Calendar connector is not configured. Please connect your Google Calendar account in the integration settings.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection/${connectionId}/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Replit-Identity": identity,
      },
    },
  );

  if (!resp.ok) {
    throw new Error(`Failed to get Google Calendar token: ${resp.statusText}`);
  }

  const data = (await resp.json()) as { access_token?: string; accessToken?: string };
  const token = data.access_token ?? data.accessToken;
  if (!token) throw new Error("No access token returned from connector");
  return token;
}

export async function gcalRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const resp = await fetch(`${GCAL_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (resp.status === 404) return null;
  if (resp.status === 204 || resp.status === 410) return null;

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Google Calendar API error ${resp.status}: ${text}`);
  }
  if (!text) return null;
  return JSON.parse(text);
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
