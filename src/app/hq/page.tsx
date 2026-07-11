"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  TEAM,
  MEMBERS,
  type Member,
  type MemberId,
} from "@/data/team";
import { SEED_TASKS, type Task, type Status } from "@/data/hq-tasks";
import {
  Clock,
  Globe,
  Users,
  AlertTriangle,
  ArrowRight,
  Plus,
  Languages,
  RefreshCw,
  ExternalLink,
  Sun,
  Moon,
  Coffee,
  Ban,
  CircleDot,
  CheckCircle2,
  Circle,
  Sparkles,
  X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────
// Timezone helpers
// ─────────────────────────────────────────────────────────────────────────

/** Current UTC offset (in hours) for an IANA time zone, DST-aware. */
function offsetHours(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = dtf.formatToParts(date).reduce<Record<string, string>>((a, x) => {
    a[x.type] = x.value;
    return a;
  }, {});
  const asUTC = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second,
  );
  return Math.round((asUTC - date.getTime()) / 3_600_000);
}

function localTimeLabel(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function localDayLabel(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
}

const mod24 = (n: number) => ((n % 24) + 24) % 24;

type Presence = "work" | "awake" | "sleep";

function presenceAt(localHour: number, m: Member): Presence {
  const h = mod24(localHour);
  if (h < 7 || h >= 23) return "sleep";
  const inWork =
    m.workStart <= m.workEnd
      ? h >= m.workStart && h < m.workEnd
      : h >= m.workStart || h < m.workEnd;
  return inWork ? "work" : "awake";
}

const PRESENCE_STYLE: Record<Presence, string> = {
  work: "bg-emerald-400",
  awake: "bg-amber-300",
  sleep: "bg-slate-200",
};

// ─────────────────────────────────────────────────────────────────────────
// Task helpers
// ─────────────────────────────────────────────────────────────────────────

function isBlocked(task: Task, byId: Record<string, Task>): boolean {
  return (
    task.status !== "done" &&
    task.blockedBy.some((id) => byId[id] && byId[id].status !== "done")
  );
}

/** What the card actually shows — blocked is derived from live blocker state. */
function effectiveStatus(task: Task, byId: Record<string, Task>): Status {
  if (task.status === "done") return "done";
  if (isBlocked(task, byId)) return "blocked";
  return task.status === "blocked" ? "active" : task.status;
}

const STATUS_META: Record<
  Status,
  { label: string; labelZh: string; icon: typeof Circle; className: string }
> = {
  todo: { label: "To do", labelZh: "待办", icon: Circle, className: "text-slate-400" },
  active: {
    label: "In progress",
    labelZh: "进行中",
    icon: CircleDot,
    className: "text-indigo-500",
  },
  blocked: {
    label: "Blocked",
    labelZh: "被阻塞",
    icon: Ban,
    className: "text-rose-500",
  },
  done: {
    label: "Done",
    labelZh: "已完成",
    icon: CheckCircle2,
    className: "text-emerald-500",
  },
};

// Notion tasks are the source of truth; these hold only the local overlay
// (status you toggle in-app, and app-native tasks) so the demo stays interactive.
const OVERRIDES_KEY = "conneverse-hq-overrides-v2";
const NATIVE_KEY = "conneverse-hq-native-v2";

/** Today's date (YYYY-MM-DD) in a given time zone — advances on its own. */
function isoInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function daysUntil(due: string | undefined, todayISO: string): number | null {
  if (!due) return null;
  const a = new Date(todayISO + "T00:00:00Z").getTime();
  const b = new Date(due + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// todayISO === null → pre-mount (server render): show the absolute date so
// server and client markup match. After mount we show live relative days.
function dueLabel(
  due: string | undefined,
  todayISO: string | null,
): { text: string; urgent: boolean } | null {
  if (!due) return null;
  if (!todayISO) return { text: `Due ${shortDate(due)}`, urgent: false };
  const d = daysUntil(due, todayISO);
  if (d === null) return null;
  if (d < 0) return { text: `${-d}d overdue`, urgent: true };
  if (d === 0) return { text: "Due today", urgent: true };
  if (d === 1) return { text: "Due tomorrow", urgent: true };
  return { text: `Due in ${d}d`, urgent: d <= 2 };
}

/** "just now" / "3m ago" / "2h ago" — for the live sync badge. */
function relTime(from: Date, now: Date, lang: "en" | "zh"): string {
  const s = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (s < 45) return lang === "zh" ? "刚刚" : "just now";
  const m = Math.round(s / 60);
  if (m < 60) return lang === "zh" ? `${m} 分钟前` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === "zh" ? `${h} 小时前` : `${h}h ago`;
  const d = Math.round(h / 24);
  return lang === "zh" ? `${d} 天前` : `${d}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function HQPage() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [viewer, setViewer] = useState<MemberId>("ying");
  // Tasks pulled from the /api/hq/tasks endpoint (Notion, or seed fallback).
  const [remote, setRemote] = useState<{
    tasks: Task[];
    syncedAt: string | null;
    source: "notion" | "seed";
  } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Status>>({});
  const [nativeTasks, setNativeTasks] = useState<Task[]>([]);
  const [zones, setZones] = useState<Record<MemberId, string>>(
    Object.fromEntries(TEAM.map((m) => [m.id, m.timeZone])) as Record<
      MemberId,
      string
    >,
  );
  const [adding, setAdding] = useState<MemberId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Live clock (client only, to avoid hydration mismatch). Ticks every 15s so
  // the current time, relative "synced" label, and due-date math stay current
  // on their own — and roll over to the next day automatically.
  useEffect(() => {
    setMounted(true);
    const stamp = new Date();
    setNow(stamp);
    setLastSync(stamp);
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Live "today" in the viewer's own time zone (null until mounted).
  const todayISO = useMemo(
    () => (now ? isoInZone(now, zones[viewer]) : null),
    [now, zones, viewer],
  );

  const t = useCallback(
    (en: string, zh: string) => (lang === "zh" ? zh : en),
    [lang],
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  // Pull the task list from the server (Notion-backed, seed fallback).
  const loadTasks = useCallback(async (refresh = false) => {
    try {
      const res = await fetch(`/api/hq/tasks${refresh ? "?refresh=1" : ""}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setRemote({
        tasks: data.tasks as Task[],
        syncedAt: data.syncedAt ?? null,
        source: data.source,
      });
      setLastSync(new Date());
      return data.source as "notion" | "seed";
    } catch {
      return null;
    }
  }, []);

  // Initial load + auto-refresh every 60s so HQ mirrors Notion on its own.
  // Also restore the local overlay (in-app status toggles / native tasks).
  useEffect(() => {
    try {
      const o = localStorage.getItem(OVERRIDES_KEY);
      if (o) setOverrides(JSON.parse(o));
      const n = localStorage.getItem(NATIVE_KEY);
      if (n) setNativeTasks(JSON.parse(n));
    } catch {}
    loadTasks();
    const id = setInterval(() => loadTasks(), 60_000);
    return () => clearInterval(id);
  }, [loadTasks]);

  // Persist the local overlay.
  useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
      } catch {}
    }
  }, [overrides, mounted]);
  useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem(NATIVE_KEY, JSON.stringify(nativeTasks));
      } catch {}
    }
  }, [nativeTasks, mounted]);

  // Merge: Notion (or seed) base + app-native tasks, with local status overrides.
  const tasks = useMemo(() => {
    const base = remote?.tasks ?? SEED_TASKS;
    return [...base, ...nativeTasks].map((task) =>
      overrides[task.id] ? { ...task, status: overrides[task.id] } : task,
    );
  }, [remote, nativeTasks, overrides]);

  const byId = useMemo(
    () => Object.fromEntries(tasks.map((t) => [t.id, t])) as Record<string, Task>,
    [tasks],
  );

  const cycleStatus = useCallback((id: string, current: Status) => {
    const order: Status[] = ["todo", "active", "done"];
    const cur = current === "blocked" ? "active" : current;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    setOverrides((prev) => ({ ...prev, [id]: next }));
  }, []);

  const addTask = useCallback((owner: MemberId, titleEn: string) => {
    if (!titleEn.trim()) return;
    const id = `t-native-${Date.now()}`;
    setNativeTasks((prev) => [
      ...prev,
      {
        id,
        title: { en: titleEn.trim(), zh: titleEn.trim() },
        owner,
        area: "New",
        status: "todo",
        blockedBy: [],
        source: "native",
        updated: new Date().toISOString().slice(0, 10),
      },
    ]);
    setAdding(null);
  }, []);

  const resyncNotion = useCallback(async () => {
    const src = await loadTasks(true);
    showToast(
      src === "notion"
        ? t("Re-synced from Notion", "已从 Notion 重新同步")
        : t("No Notion token — showing demo data", "未配置 Notion — 显示演示数据"),
    );
  }, [loadTasks, showToast, t]);

  // ── Timezone / meeting math ────────────────────────────────────────────
  const tz = useMemo(() => {
    if (!now) return null;
    const off = Object.fromEntries(
      TEAM.map((m) => [m.id, offsetHours(zones[m.id], now)]),
    ) as Record<MemberId, number>;

    const clocks = TEAM.map((m) => {
      const localHour = mod24(now.getUTCHours() + off[m.id]);
      return {
        m,
        time: localTimeLabel(zones[m.id], now),
        day: localDayLabel(zones[m.id], now),
        presence: presenceAt(localHour, m),
      };
    });

    // 24 columns anchored to the *viewer's* local hours 0..23.
    const viewerOff = off[viewer];
    const grid = Array.from({ length: 24 }, (_, c) => {
      const utc = c - viewerOff;
      const cells = TEAM.map((m) => {
        const lh = mod24(utc + off[m.id]);
        return { id: m.id, presence: presenceAt(lh, m), localHour: lh };
      });
      const allAwake = cells.every((x) => x.presence !== "sleep");
      const allWork = cells.every((x) => x.presence === "work");
      return { col: c, cells, allAwake, allWork };
    });

    // Best contiguous "everyone awake" window (prefer all-working).
    const score = (g: (typeof grid)[number]) =>
      g.allWork ? 2 : g.allAwake ? 1 : 0;
    let best: { start: number; len: number; s: number } | null = null;
    let run: { start: number; len: number; s: number } | null = null;
    for (let c = 0; c <= 24; c++) {
      const s = c < 24 ? score(grid[c]) : 0;
      if (s > 0) {
        if (run && run.s === s) run.len++;
        else {
          if (run && (!best || run.s * 100 + run.len > best.s * 100 + best.len))
            best = run;
          run = { start: c, len: 1, s };
        }
      } else {
        if (run && (!best || run.s * 100 + run.len > best.s * 100 + best.len))
          best = run;
        run = null;
      }
    }

    const nowCol = mod24(now.getUTCHours() + viewerOff);

    let window: { label: string; perMember: { m: Member; range: string }[] } | null =
      null;
    if (best) {
      const startUtc = best.start - viewerOff;
      const endUtc = startUtc + best.len;
      const fmt = (h: number) => {
        const hh = mod24(h);
        const ap = hh < 12 ? "am" : "pm";
        const h12 = hh % 12 === 0 ? 12 : hh % 12;
        return `${h12}${ap}`;
      };
      window = {
        label: best.s === 2 ? t("All in work hours", "都在工作时段") : t("Everyone awake", "都醒着"),
        perMember: TEAM.map((m) => ({
          m,
          range: `${fmt(startUtc + off[m.id])}–${fmt(endUtc + off[m.id])}`,
        })),
      };
    }

    return { off, clocks, grid, nowCol, window };
  }, [now, zones, viewer, t]);

  // ── Bottleneck feed ────────────────────────────────────────────────────
  const bottlenecks = useMemo(() => {
    const out: { blocked: Task; blocker: Task }[] = [];
    for (const task of tasks) {
      if (task.status === "done") continue;
      for (const bid of task.blockedBy) {
        const blocker = byId[bid];
        if (blocker && blocker.status !== "done") out.push({ blocked: task, blocker });
      }
    }
    return out;
  }, [tasks, byId]);

  const viewerBlocking = bottlenecks.filter((b) => b.blocker.owner === viewer);

  // ── Daily digest (personalized) ────────────────────────────────────────
  const digest = useMemo(() => {
    const mine = tasks.filter((t) => t.owner === viewer);
    const active = mine.filter((t) => effectiveStatus(t, byId) === "active").length;
    const blocked = mine.filter((t) => effectiveStatus(t, byId) === "blocked").length;
    const dueSoon = mine.filter((t) => {
      const d = todayISO ? daysUntil(t.due, todayISO) : null;
      return t.status !== "done" && d !== null && d <= 2;
    });
    return { active, blocked, dueSoon };
  }, [tasks, viewer, byId, todayISO]);

  const viewerMember = MEMBERS[viewer];

  return (
    <main className="min-h-screen bg-[#F7F8FA] text-[#1A1A2E]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1A1A2E] text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Conneverse HQ</div>
              <div className="text-[11px] text-slate-400">
                {t("Team progress & coordination", "团队进度与协作")}
              </div>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Viewing-as */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
              <span className="px-1.5 text-[11px] text-slate-400">
                {t("Viewing as", "当前视角")}
              </span>
              {TEAM.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setViewer(m.id)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                    viewer === m.id
                      ? "text-white"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                  style={viewer === m.id ? { backgroundColor: m.color } : undefined}
                >
                  {lang === "zh" ? m.nameZh : m.name}
                </button>
              ))}
            </div>

            {/* Language */}
            <button
              onClick={() => setLang((l) => (l === "en" ? "zh" : "en"))}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Languages className="h-3.5 w-3.5" />
              {lang === "en" ? "EN" : "中文"}
            </button>

            {/* Notion sync */}
            <button
              onClick={resyncNotion}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title={
                remote?.source === "notion"
                  ? t("Auto-syncs from Notion every 60s · click to refresh now", "每 60 秒自动从 Notion 同步 · 点击立即刷新")
                  : t("Not connected to Notion — showing demo data. Click to retry.", "未连接 Notion — 显示演示数据。点击重试。")
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  remote?.source === "notion"
                    ? "bg-emerald-500"
                    : remote?.source === "seed"
                      ? "bg-amber-400"
                      : "bg-slate-300"
                }`}
              />
              <RefreshCw className="h-3.5 w-3.5" />
              {!mounted || !remote
                ? t("Sync", "同步")
                : remote.source === "notion"
                  ? `${t("Notion", "Notion")} · ${lastSync && now ? relTime(lastSync, now, lang) : ""}`
                  : t("Demo data", "演示数据")}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6">
        {/* Digest banner */}
        <section
          className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border p-4"
          style={{
            borderColor: `${viewerMember.color}33`,
            backgroundColor: `${viewerMember.color}0D`,
          }}
        >
          <div className="flex items-center gap-2">
            <Avatar m={viewerMember} />
            <div className="leading-tight">
              <div className="text-sm font-semibold">
                {t("Good day,", "你好，")} {lang === "zh" ? viewerMember.nameZh : viewerMember.name}
              </div>
              <div className="text-[11px] text-slate-500">
                {mounted && tz
                  ? `${tz.clocks.find((c) => c.m.id === viewer)?.day} · ${tz.clocks.find((c) => c.m.id === viewer)?.time} ${t("your time", "本地时间")}`
                  : "—"}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <DigestStat n={digest.active} label={t("in progress", "进行中")} tone="text-indigo-600" />
            <DigestStat n={digest.blocked} label={t("blocked", "被阻塞")} tone="text-rose-600" />
            <DigestStat n={viewerBlocking.length} label={t("others waiting on you", "有人在等你")} tone="text-amber-600" />
            <DigestStat n={digest.dueSoon.length} label={t("due soon / overdue", "即将到期 / 逾期")} tone="text-slate-700" />
          </div>
        </section>

        {/* ── Timezone + meeting finder ── */}
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Globe className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold">
              {t("Where everyone is right now", "此刻大家在哪儿")}
            </h2>
            <span className="text-[11px] text-slate-400">
              {t("· click a city to change zone", "· 点击城市可切换时区")}
            </span>
          </div>

          {/* Clocks */}
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {(mounted && tz ? tz.clocks : TEAM.map((m) => ({ m, time: "—", day: "", presence: "awake" as Presence }))).map(
              ({ m, time, day, presence }) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                >
                  <Avatar m={m} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {lang === "zh" ? m.nameZh : m.name}
                      <PresenceIcon presence={presence} />
                    </div>
                    <ZonePicker
                      value={zones[m.id]}
                      onChange={(z) => setZones((p) => ({ ...p, [m.id]: z }))}
                    />
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold tabular-nums leading-none">
                      {time}
                    </div>
                    <div className="text-[11px] text-slate-400">{day}</div>
                  </div>
                </div>
              ),
            )}
          </div>

          {/* Availability heatmap */}
          {mounted && tz && (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <LegendDot className="bg-emerald-400" label={t("work hours", "工作时段")} />
                <LegendDot className="bg-amber-300" label={t("awake", "清醒")} />
                <LegendDot className="bg-slate-200" label={t("asleep", "睡眠")} />
                <span className="ml-auto">
                  {t("Timeline in", "时间轴基于")} {lang === "zh" ? viewerMember.nameZh : viewerMember.name}
                  {t("'s local time", " 的本地时间")}
                </span>
              </div>

              <div className="space-y-1">
                {TEAM.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <div className="w-14 shrink-0 text-right text-[11px] font-medium text-slate-500">
                      {lang === "zh" ? m.nameZh : m.name}
                    </div>
                    <div className="flex flex-1 gap-px overflow-hidden rounded">
                      {tz.grid.map((g) => {
                        const cell = g.cells.find((c) => c.id === m.id)!;
                        const isNow = g.col === tz.nowCol;
                        return (
                          <div
                            key={g.col}
                            className={`h-6 flex-1 ${PRESENCE_STYLE[cell.presence]} ${
                              g.allAwake ? "ring-1 ring-inset ring-indigo-500/40" : ""
                            } ${isNow ? "outline outline-2 -outline-offset-1 outline-[#1A1A2E]" : ""}`}
                            title={`${m.name} · ${mod24(cell.localHour)}:00 · ${cell.presence}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
                {/* hour axis */}
                <div className="flex items-center gap-2 pt-0.5">
                  <div className="w-14 shrink-0" />
                  <div className="flex flex-1">
                    {tz.grid.map((g) => (
                      <div
                        key={g.col}
                        className="flex-1 text-center text-[9px] text-slate-300"
                      >
                        {g.col % 3 === 0 ? g.col : ""}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Best window */}
              <div className="mt-4 rounded-xl bg-indigo-50 p-3">
                {tz.window ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700">
                      <Clock className="h-4 w-4" />
                      {t("Best time to meet", "最佳会议时间")}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-600">
                      {tz.window.label}
                    </span>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      {tz.window.perMember.map(({ m, range }) => (
                        <span key={m.id}>
                          <span className="font-medium" style={{ color: m.color }}>
                            {lang === "zh" ? m.nameZh : m.name}
                          </span>{" "}
                          {range}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <span className="text-sm text-slate-500">
                    {t(
                      "No shared awake window today — schedule async instead.",
                      "今天没有共同清醒的时段 — 建议改用异步协作。",
                    )}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Bottleneck feed ── */}
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">
              {t("Who's blocking whom", "谁在阻塞谁")}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {bottlenecks.length}
            </span>
          </div>

          {bottlenecks.length === 0 ? (
            <p className="text-sm text-slate-400">
              {t("Nothing blocked — clear runway. 🎉", "没有阻塞 — 一路畅通。🎉")}
            </p>
          ) : (
            <ul className="space-y-2">
              {bottlenecks.map(({ blocked, blocker }, i) => {
                const bo = MEMBERS[blocker.owner];
                const wo = MEMBERS[blocked.owner];
                const forViewer =
                  blocker.owner === viewer || blocked.owner === viewer;
                return (
                  <li
                    key={i}
                    className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm ${
                      forViewer
                        ? "border-amber-200 bg-amber-50"
                        : "border-slate-100 bg-slate-50/50"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Dot color={wo.color} />
                      <span className="font-medium">{lang === "zh" ? wo.nameZh : wo.name}</span>
                      <span className="text-slate-400">{t("is waiting", "在等待")}</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                    <span className="text-slate-600">
                      {blocker.title[lang]}
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-400">
                      {t("owned by", "负责人")}
                      <Dot color={bo.color} />
                      <span className="font-medium text-slate-600">
                        {lang === "zh" ? bo.nameZh : bo.name}
                      </span>
                    </span>
                    {blocker.owner === viewer && (
                      <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                        {t("you're the bottleneck", "你是瓶颈")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Task lanes ── */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold">{t("Work by owner", "按负责人分工")}</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {TEAM.map((m) => {
              const laneTasks = tasks
                .filter((task) => task.owner === m.id)
                .sort((a, b) => {
                  const rank = (t: Task) => {
                    const s = effectiveStatus(t, byId);
                    return s === "blocked" ? 0 : s === "active" ? 1 : s === "todo" ? 2 : 3;
                  };
                  return rank(a) - rank(b);
                });
              return (
                <div key={m.id} className="rounded-2xl border border-slate-200 bg-white">
                  {/* lane header */}
                  <div
                    className="flex items-center gap-2 rounded-t-2xl border-b border-slate-100 px-4 py-3"
                    style={{ backgroundColor: `${m.color}0D` }}
                  >
                    <Avatar m={m} />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="text-sm font-semibold">
                        {lang === "zh" ? m.nameZh : m.name}
                      </div>
                      <div className="truncate text-[11px] text-slate-400">
                        {lang === "zh" ? m.roleZh : m.role}
                      </div>
                    </div>
                    <button
                      onClick={() => setAdding(adding === m.id ? null : m.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700"
                      title={t("Add task", "添加任务")}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-2 p-3">
                    {adding === m.id && (
                      <AddTaskInput
                        onAdd={(title) => addTask(m.id, title)}
                        onCancel={() => setAdding(null)}
                        placeholder={t("New task…", "新任务…")}
                      />
                    )}
                    {laneTasks.length === 0 && adding !== m.id && (
                      <p className="px-1 py-4 text-center text-xs text-slate-300">
                        {t("No tasks", "暂无任务")}
                      </p>
                    )}
                    {laneTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        status={effectiveStatus(task, byId)}
                        lang={lang}
                        byId={byId}
                        todayISO={todayISO}
                        onCycle={() => cycleStatus(task.id, task.status)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="mt-8 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            {t(
              "Prototype · task edits saved locally · seeded from your Notion",
              "原型 · 编辑保存在本地 · 数据源自你的 Notion",
            )}
          </span>
          <Link href="/" className="hover:text-slate-600">
            ← {t("Back to parts agent", "返回配件助手")}
          </Link>
        </footer>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[#1A1A2E] px-4 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Small components
// ─────────────────────────────────────────────────────────────────────────

function Avatar({ m }: { m: Member }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: m.color }}
    >
      {m.initials}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function DigestStat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={`text-lg font-bold tabular-nums ${tone}`}>{n}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </span>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

function PresenceIcon({ presence }: { presence: Presence }) {
  if (presence === "work")
    return <Coffee className="h-3.5 w-3.5 text-emerald-500" />;
  if (presence === "awake") return <Sun className="h-3.5 w-3.5 text-amber-400" />;
  return <Moon className="h-3.5 w-3.5 text-slate-300" />;
}

const ZONE_OPTIONS = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Paris",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Australia/Sydney",
];

function ZonePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (z: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-0.5 max-w-full cursor-pointer truncate bg-transparent text-[11px] text-slate-400 outline-none hover:text-slate-600"
    >
      {ZONE_OPTIONS.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, " ").split("/")[1]}
        </option>
      ))}
    </select>
  );
}

function AddTaskInput({
  onAdd,
  onCancel,
  placeholder,
}: {
  onAdd: (title: string) => void;
  onCancel: () => void;
  placeholder: string;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50/40 p-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onAdd(value);
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-slate-400"
      />
      <button
        onClick={() => onAdd(value)}
        className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onCancel}
        className="rounded-md p-1 text-slate-400 hover:bg-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TaskCard({
  task,
  status,
  lang,
  byId,
  todayISO,
  onCycle,
}: {
  task: Task;
  status: Status;
  lang: "en" | "zh";
  byId: Record<string, Task>;
  todayISO: string | null;
  onCycle: () => void;
}) {
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;
  const other = lang === "en" ? "zh" : "en";
  const due = dueLabel(task.due, todayISO);
  const blockers = task.blockedBy
    .map((id) => byId[id])
    .filter((b) => b && b.status !== "done");

  return (
    <div
      className={`group rounded-xl border p-3 transition ${
        status === "blocked"
          ? "border-rose-100 bg-rose-50/40"
          : status === "done"
            ? "border-slate-100 bg-slate-50/40 opacity-70"
            : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={onCycle}
          className={`mt-0.5 shrink-0 ${meta.className} transition hover:scale-110`}
          title={t2(lang, "Click to change status", "点击切换状态")}
        >
          <StatusIcon className="h-[18px] w-[18px]" />
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm leading-snug ${
              status === "done" ? "text-slate-400 line-through" : "text-slate-800"
            }`}
          >
            {task.title[lang]}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
            {task.title[other]}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {task.area}
            </span>
            {due && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                  due.urgent ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-500"
                }`}
              >
                {due.text}
              </span>
            )}
            {task.source === "notion" ? (
              <a
                href={task.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-200"
                title={task.sourceLabel}
              >
                Notion <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : (
              <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-500">
                {t2(lang, "In-app", "应用内")}
              </span>
            )}
          </div>

          {status === "blocked" && blockers.length > 0 && (
            <div className="mt-2 flex items-start gap-1 text-[11px] text-rose-500">
              <Ban className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                {t2(lang, "Waiting on:", "等待：")}{" "}
                {blockers.map((b) => b!.title[lang]).join("; ")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// tiny helper for components that don't close over the page `t`
function t2(lang: "en" | "zh", en: string, zh: string) {
  return lang === "zh" ? zh : en;
}
