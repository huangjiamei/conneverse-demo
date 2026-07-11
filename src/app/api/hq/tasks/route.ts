import { SEED_TASKS } from "@/data/hq-tasks";
import { fetchNotionTasks } from "@/lib/notion";

export const dynamic = "force-dynamic";

// Small in-instance cache so rapid client polls / page loads don't hammer the
// Notion API. Freshness for the user comes from the client polling this route
// every 60s; the TTL just de-dupes bursts within one server instance.
const TTL_MS = 30_000;
let cache: { at: number; body: TasksResponse } | null = null;

interface TasksResponse {
  source: "notion" | "seed";
  syncedAt: string | null;
  tasks: typeof SEED_TASKS;
  note?: string;
}

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.has("refresh");

  if (!refresh && cache && Date.now() - cache.at < TTL_MS) {
    return Response.json(cache.body);
  }

  let body: TasksResponse;
  try {
    const result = await fetchNotionTasks();
    if (result) {
      body = {
        source: "notion",
        syncedAt: result.syncedAt,
        tasks: result.tasks,
      };
    } else {
      body = {
        source: "seed",
        syncedAt: null,
        tasks: SEED_TASKS,
        note: "NOTION_TOKEN not set — showing local demo data.",
      };
    }
  } catch (err) {
    // Notion misconfigured or unreachable — degrade to seed, never 500.
    body = {
      source: "seed",
      syncedAt: null,
      tasks: SEED_TASKS,
      note: `Notion sync failed, showing demo data: ${(err as Error).message}`,
    };
  }

  cache = { at: Date.now(), body };
  return Response.json(body);
}
