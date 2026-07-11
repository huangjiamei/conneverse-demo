import type { MemberId } from "./team";

// Tasks seeded from the real Conneverse Notion (Roadmap + Internal Meeting
// Notes, as of 2026-07-01). `source: "notion"` items mirror a Notion page and
// link back to it; `source: "native"` items are created directly in HQ.
//
// The blockedBy links encode the real cross-person dependency chain the team
// keeps hitting:
//   Ying (shop data / API fields) → Da Mei (test set / metrics)
//   Da Mei (test set)            → Tian Hao (v1 retrieval algo)
//   Tian Hao (coverage results)  → Ying (customer & supplier deals)
// i.e. everyone is both a bottleneck and blocked — the whole point of HQ.

export type Status = "todo" | "active" | "blocked" | "done";

export interface Task {
  id: string;
  title: { en: string; zh: string };
  owner: MemberId;
  area: string;
  status: Status;
  blockedBy: string[]; // task ids that must be done first
  due?: string; // ISO date (YYYY-MM-DD)
  source: "notion" | "native";
  sourceUrl?: string;
  sourceLabel?: string; // e.g. "Internal Notes · 2026/07/01"
  updated: string; // ISO date
}

const NOTES = "https://app.notion.com/p/37fbfc42c86380afbdb5d7b8f333e2ba";

export const SEED_TASKS: Task[] = [
  {
    id: "t-shop-data",
    title: {
      en: "Pull order-data format + 1yr of historical orders from repair shops",
      zh: "从汽修店获取订单数据格式与一年历史订单",
    },
    owner: "ying",
    area: "Data",
    status: "active",
    blockedBy: [],
    due: "2026-07-06",
    source: "notion",
    sourceUrl: NOTES,
    sourceLabel: "Internal Notes · 2026/06/21",
    updated: "2026-06-27",
  },
  {
    id: "t-metric-fields",
    title: {
      en: "Research Tech Metric API fields & confirm data-access rights",
      zh: "研究 Tech Metric API 字段并确认数据获取权限",
    },
    owner: "ying",
    area: "Data",
    status: "active",
    blockedBy: [],
    due: "2026-07-03",
    source: "notion",
    sourceUrl: NOTES,
    sourceLabel: "Internal Notes · 2026/06/14",
    updated: "2026-06-24",
  },
  {
    id: "t-metrics",
    title: {
      en: "Finalize the metric system (fitment rate, coverage, delivery timeliness)",
      zh: "细化指标体系（配对率、覆盖率、交付及时率）",
    },
    owner: "damei",
    area: "Data",
    status: "blocked",
    blockedBy: ["t-metric-fields"],
    due: "2026-07-05",
    source: "notion",
    sourceUrl: NOTES,
    sourceLabel: "Internal Notes · 2026/06/21",
    updated: "2026-06-27",
  },
  {
    id: "t-dataset",
    title: {
      en: "Clean test-set labels & hand the dataset to Ying tonight",
      zh: "今晚整理测试集标签并把数据集发给 Ying",
    },
    owner: "damei",
    area: "Test Sets",
    status: "active",
    blockedBy: [],
    due: "2026-07-01",
    source: "notion",
    sourceUrl: NOTES,
    sourceLabel: "Internal Notes · 2026/07/01",
    updated: "2026-07-01",
  },
  {
    id: "t-algo-v1",
    title: {
      en: "Ship v1 eBay retrieval algo; output match-coverage on the test set",
      zh: "完成第一版 eBay 检索算法，并输出测试集匹配覆盖率",
    },
    owner: "tianhao",
    area: "Algorithm",
    status: "blocked",
    blockedBy: ["t-dataset"],
    due: "2026-07-04",
    source: "notion",
    sourceUrl: NOTES,
    sourceLabel: "Internal Notes · 2026/07/01",
    updated: "2026-07-01",
  },
  {
    id: "t-algo-opt",
    title: {
      en: "Draft optimization plan: category retrieval, query rewriting, N-gram",
      zh: "拟定优化方案：分类检索、Query 改写、N-gram 补充",
    },
    owner: "damei",
    area: "Algorithm",
    status: "todo",
    blockedBy: [],
    due: "2026-07-07",
    source: "notion",
    sourceUrl: NOTES,
    sourceLabel: "Internal Notes · 2026/07/01",
    updated: "2026-07-01",
  },
  {
    id: "t-biz-dev",
    title: {
      en: "Use v1 coverage results to open new customer & supplier deals",
      zh: "用 v1 覆盖率成果拓展新客户与供应商",
    },
    owner: "ying",
    area: "Suppliers",
    status: "blocked",
    blockedBy: ["t-algo-v1"],
    due: "2026-07-09",
    source: "notion",
    sourceUrl: NOTES,
    sourceLabel: "Internal Notes · 2026/07/01",
    updated: "2026-07-01",
  },
  {
    id: "t-supplier-export",
    title: {
      en: "Follow up with the $1B parts-export partner; invite Da Mei to align",
      zh: "跟进十亿美金零部件出海伙伴，邀请大梅一起对齐需求",
    },
    owner: "ying",
    area: "Suppliers",
    status: "active",
    blockedBy: [],
    due: "2026-07-04",
    source: "notion",
    sourceUrl: NOTES,
    sourceLabel: "Internal Notes · 2026/06/27",
    updated: "2026-06-27",
  },
  {
    id: "t-offline-notes",
    title: {
      en: "Write up the offline shop-visit recordings for the team",
      zh: "整理线下门店调研录音纪要，供团队了解采购流程与痛点",
    },
    owner: "ying",
    area: "Customers",
    status: "active",
    blockedBy: [],
    due: "2026-07-03",
    source: "notion",
    sourceUrl: NOTES,
    sourceLabel: "Internal Notes · 2026/06/27",
    updated: "2026-06-28",
  },
  {
    id: "t-competitive",
    title: {
      en: "Review competitor data metrics & algorithms (PartsTech, OEC)",
      zh: "复盘竞品的数据指标与算法（PartsTech、OEC）",
    },
    owner: "damei",
    area: "Research",
    status: "active",
    blockedBy: [],
    due: "2026-07-05",
    source: "notion",
    sourceUrl: NOTES,
    sourceLabel: "Internal Notes · 2026/06/14",
    updated: "2026-06-24",
  },
  {
    id: "t-fixico",
    title: {
      en: "Research Fixico as a comparable",
      zh: "调研 Fixico 竞品",
    },
    owner: "damei",
    area: "Research",
    status: "done",
    blockedBy: [],
    source: "notion",
    sourceUrl: NOTES,
    sourceLabel: "Internal Notes · 2026/06/18",
    updated: "2026-06-24",
  },
  {
    id: "t-standup",
    title: {
      en: "Set up a weekly async standup ritual (recorded, no live meeting)",
      zh: "建立每周异步站会机制（录制，无需实时开会）",
    },
    owner: "ying",
    area: "Roadmap",
    status: "todo",
    blockedBy: [],
    due: "2026-07-08",
    source: "native",
    updated: "2026-07-01",
  },
];

// "Today" for the prototype — matches the latest meeting note so the digest and
// due-date logic line up with the seeded data.
export const TODAY = "2026-07-01";
