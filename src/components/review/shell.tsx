/**
 * 审核列表的通用外壳 —— 页头、卡片、空状态、状态徽章。
 * server component,三个列表页共用。
 */

import type { ShopAdminRequestKind, UserStatus } from "@prisma/client";

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1A1A2E]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
      {children}
    </div>
  );
}

export function ReviewRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4">
      {children}
    </li>
  );
}

const KIND_META: Record<
  ShopAdminRequestKind,
  { label: string; cls: string; hint: string }
> = {
  CLAIM: {
    label: "Claim",
    cls: "bg-teal-50 text-teal-700 border-teal-200",
    hint: "Shop has no admin — this user is claiming it.",
  },
  REPLACE: {
    label: "Replace",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    hint: "Approving this replaces the current admin.",
  },
};

export function KindBadge({ kind }: { kind: ShopAdminRequestKind }) {
  const m = KIND_META[kind];
  return (
    <span
      title={m.hint}
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

export function kindHint(kind: ShopAdminRequestKind): string {
  return KIND_META[kind].hint;
}

const STATUS_CLS: Record<UserStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  DISABLED: "bg-gray-100 text-gray-500 border-gray-300",
};

export function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLS[status]}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

/**
 * 邮箱未验证 —— 独立于 UserStatus 的一态 (§B 顺序)。
 *
 * 这类注册还没正式进入待审核队列: 列表里标出来,但不给 Approve/Reject 按钮,
 * 因为后端也会拒绝批准 (EMAIL_UNVERIFIED)。等对方点了验证链接,平台管理员会
 * 收到 adminNewRequest,那时它才变成一条真的待办。
 */
export function EmailUnverifiedBadge() {
  return (
    <span
      title="This person hasn't clicked the verification link in their email yet."
      className="inline-block rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500"
    >
      Email unverified
    </span>
  );
}

/** 未验证时代替审核按钮的一行说明 */
export function AwaitingVerificationHint() {
  return (
    <span className="shrink-0 whitespace-nowrap text-[11px] text-gray-400">
      Waiting on email verification
    </span>
  );
}

export function formatWhen(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
