import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

const MAX_RATE_LIMIT_RETRIES = 5;
const RATE_LIMIT_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function todoistRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const response = await connectors.proxy("todoist", path, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const delay = RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt + Math.random() * 250;
        await sleep(delay);
        continue;
      }
      const text = await response.text();
      throw new Error(`Todoist API error ${response.status}: ${text}`);
    }
    if (response.status === 204) return {};
    return response.json();
  }
}

export async function todoistListProjects(): Promise<{ id: string; name: string }[]> {
  const data = await todoistRequest("GET", "/api/v1/projects") as { results?: { id: string; name: string }[] } | null;
  return data?.results ?? [];
}

export function makeTodoistTask(
  content: string,
  description: string,
  dueDate: string,
  projectId?: string,
): object {
  return {
    content,
    description,
    due_date: dueDate,
    ...(projectId ? { project_id: projectId } : {}),
  };
}
