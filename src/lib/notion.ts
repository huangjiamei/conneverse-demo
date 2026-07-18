import type { Task, Status } from "@/data/hq-tasks";
import type { MemberId } from "@/data/team";

// Reads the "Conneverse HQ — Tasks" Notion database via the REST API and maps
// each row to the app's Task shape. Returns null when not configured, so the
// app falls back to the local seed and keeps working with zero setup.
//
// Env:
//   NOTION_TOKEN        internal-integration secret (the page must be shared
//                       with that integration)
//   NOTION_TASKS_DB_ID  the database id (defaults to the one created for you)

const DEFAULT_DB_ID = "96858c292a8e4c8d8e3aadb4c35d9714";
const NOTION_VERSION = "2022-06-28";

const OWNER_MAP: Record<string, MemberId> = {
  Ying: "ying",
  "Da Mei": "damei",
  "Tian Hao": "tianhao",
};

const STATUS_MAP: Record<string, Status> = {
  "To do": "todo",
  "In progress": "active",
  Blocked: "blocked",
  Done: "done",
};

type NotionProp = Record<string, unknown>;

function plainText(prop: NotionProp | undefined): string {
  if (!prop) return "";
  const arr = (prop.title ?? prop.rich_text) as
    { plain_text?: string }[] | undefined;
  if (!Array.isArray(arr)) return "";
  return arr
    .map((t) => t.plain_text ?? "")
    .join("")
    .trim();
}

function selectName(prop: NotionProp | undefined): string {
  const sel = prop?.select as { name?: string } | undefined;
  return sel?.name ?? "";
}

function dateStart(prop: NotionProp | undefined): string | undefined {
  const d = prop?.date as { start?: string } | undefined;
  return d?.start ?? undefined;
}

interface NotionPage {
  id: string;
  url?: string;
  last_edited_time?: string;
  properties: Record<string, NotionProp>;
}

function mapPage(page: NotionPage): Task | null {
  const p = page.properties;
  const key = plainText(p["Key"]) || page.id;
  const en = plainText(p["Name"]);
  if (!en) return null; // skip empty rows
  const zh = plainText(p["Title ZH"]) || en;
  const owner = OWNER_MAP[selectName(p["Owner"])] ?? "ying";
  const status = STATUS_MAP[selectName(p["Status"])] ?? "todo";
  const blockedBy = plainText(p["Blocked by"])
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const source = selectName(p["Source"]) === "In-app" ? "native" : "notion";

  return {
    id: key,
    title: { en, zh },
    owner,
    area: selectName(p["Area"]) || "General",
    status,
    blockedBy,
    due: dateStart(p["Due"]),
    source,
    sourceUrl: page.url,
    sourceLabel: "Notion · Conneverse HQ Tasks",
    updated: (page.last_edited_time ?? "").slice(0, 10),
  };
}

export interface NotionSyncResult {
  tasks: Task[];
  syncedAt: string; // ISO timestamp of this pull
}

export async function fetchNotionTasks(): Promise<NotionSyncResult | null> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_TASKS_DB_ID || DEFAULT_DB_ID;
  if (!token) return null;

  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_size: 100 }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Notion API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { results?: NotionPage[] };
  const tasks = (data.results ?? [])
    .map(mapPage)
    .filter((t): t is Task => t !== null);

  return { tasks, syncedAt: new Date().toISOString() };
}
