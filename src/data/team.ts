// Conneverse team — the three founders.
// Timezones are IANA zone ids so DST is always correct. Each member's zone is
// editable in the HQ UI (people move, and Ying's US city is a best guess here).

export type MemberId = "ying" | "damei" | "tianhao";

export interface Member {
  id: MemberId;
  name: string; // display name (Latin)
  nameZh: string; // Chinese name
  city: string;
  timeZone: string; // IANA, e.g. "America/Los_Angeles"
  lang: "en" | "zh"; // primary working language
  role: string;
  roleZh: string;
  areas: string[]; // responsibility tags
  color: string; // accent hex
  initials: string;
  workStart: number; // local working-hour window start (0-23)
  workEnd: number; // local working-hour window end (0-23)
}

export const TEAM: Member[] = [
  {
    id: "ying",
    name: "Ying",
    nameZh: "应",
    city: "San Francisco",
    timeZone: "America/Los_Angeles",
    lang: "en",
    role: "Founder — Strategy, Customers & Suppliers",
    roleZh: "创始人 — 战略 / 客户 / 供应商",
    areas: ["Strategy", "Customers", "Suppliers", "Roadmap"],
    color: "#4F46E5", // indigo
    initials: "Y",
    workStart: 8,
    workEnd: 18,
  },
  {
    id: "damei",
    name: "Da Mei",
    nameZh: "大梅",
    city: "Paris",
    timeZone: "Europe/Paris",
    lang: "zh",
    role: "Data & Algorithm Design",
    roleZh: "数据与算法设计",
    areas: ["Data", "Algorithm", "Test Sets"],
    color: "#0EA5E9", // sky
    initials: "D",
    workStart: 9,
    workEnd: 19,
  },
  {
    id: "tianhao",
    name: "Tian Hao",
    nameZh: "高天昊",
    city: "Beijing",
    timeZone: "Asia/Shanghai",
    lang: "zh",
    role: "Algorithm Engineering",
    roleZh: "算法工程",
    areas: ["Algorithm", "Engineering", "Coverage"],
    color: "#F97316", // orange
    initials: "T",
    workStart: 10,
    workEnd: 20,
  },
];

export const MEMBERS: Record<MemberId, Member> = Object.fromEntries(
  TEAM.map((m) => [m.id, m]),
) as Record<MemberId, Member>;
