"use client";

/**
 * 注册表单。
 *
 * 店铺下拉从 GET /api/shops 拉,带 hasAdmin —— 只有选中的店 hasAdmin === false
 * 时才显示"申请当本店管理员"勾选框。换成有管理员的店时,把已勾的状态清掉,
 * 免得残留一个用户看不见却会提交的 flag。
 *
 * 成功后不自动登录 (新账号是 PENDING 且 emailVerified=false),直接跳 /pending,
 * 那边先提示去邮箱点验证链接 —— 邮箱验证通过后才算正式进入待审核。
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Field,
  FormError,
  inputClass,
  inputErrorClass,
  SubmitButton,
} from "@/components/auth/AuthCard";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

type Shop = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  hasAdmin: boolean;
};

type FieldErrors = Partial<
  Record<"name" | "email" | "password" | "confirm" | "shopId", string>
>;

// "Bay Auto Care — San Francisco, CA" / 缺地址就只显示店名
function shopLabel(s: Shop): string {
  const where = [s.city, s.state].filter(Boolean).join(", ");
  return where ? `${s.name} — ${where}` : s.name;
}

export default function RegisterForm() {
  const router = useRouter();

  const [shops, setShops] = useState<Shop[] | null>(null);
  const [shopsError, setShopsError] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shopId, setShopId] = useState("");
  const [applyAsAdmin, setApplyAsAdmin] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shops")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((data: Shop[]) => {
        if (!cancelled) setShops(data);
      })
      .catch(() => {
        if (!cancelled) setShopsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedShop = useMemo(
    () => shops?.find((s) => s.id === shopId) ?? null,
    [shops, shopId]
  );
  const canClaimAdmin = selectedShop != null && !selectedShop.hasAdmin;

  // 换店后如果新店已有管理员,清掉勾选
  useEffect(() => {
    if (!canClaimAdmin && applyAsAdmin) setApplyAsAdmin(false);
  }, [canClaimAdmin, applyAsAdmin]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // 确认密码只在前端校验 —— 服务端只收一个 password
    if (password !== confirm) {
      setFieldErrors({ confirm: "Passwords do not match." });
      return;
    }
    setFieldErrors({});
    setPending(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          shopId,
          applyAsAdmin: canClaimAdmin && applyAsAdmin,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        // verify=1 让 /pending 先讲"去收验证邮件",那才是用户的下一步;
        // email 带过去只为免得重发时再输一遍。
        const q = new URLSearchParams({ status: "PENDING", verify: "1", email });
        if (data.claimFiled) q.set("claim", "1");
        router.replace(`/pending?${q.toString()}`);
        return;
      }
      if (data.fieldErrors) setFieldErrors(data.fieldErrors);
      setError(data.error ?? "Could not complete registration.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <FormError message={error} />}

      <Field label="Name" htmlFor="name" error={fieldErrors.name}>
        <input
          id="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={fieldErrors.name ? inputErrorClass : inputClass}
          placeholder="Alex Rivera"
        />
      </Field>

      <Field label="Email" htmlFor="email" error={fieldErrors.email}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldErrors.email ? inputErrorClass : inputClass}
          placeholder="you@shop.com"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        error={fieldErrors.password}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      >
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={fieldErrors.password ? inputErrorClass : inputClass}
          placeholder="••••••••"
        />
      </Field>

      <Field
        label="Confirm password"
        htmlFor="confirm"
        error={fieldErrors.confirm}
      >
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={fieldErrors.confirm ? inputErrorClass : inputClass}
          placeholder="••••••••"
        />
      </Field>

      <Field label="Shop" htmlFor="shopId" error={fieldErrors.shopId}>
        <select
          id="shopId"
          required
          disabled={shops == null}
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
          className={fieldErrors.shopId ? inputErrorClass : inputClass}
        >
          <option value="" disabled>
            {shopsError
              ? "Could not load shops"
              : shops == null
                ? "Loading shops…"
                : "Select your shop"}
          </option>
          {(shops ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {shopLabel(s)}
            </option>
          ))}
        </select>
      </Field>

      {/* 只在该店尚无管理员时出现 */}
      {canClaimAdmin && (
        <label className="flex items-start gap-2.5 rounded-lg border border-[#00B4A6]/35 bg-teal-50/60 p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={applyAsAdmin}
            onChange={(e) => setApplyAsAdmin(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#00B4A6]"
          />
          <span className="text-[13px] leading-snug text-[#1A1A2E]">
            I&apos;m the manager of this shop — apply to be its admin
            <span className="block text-xs text-gray-500 mt-0.5">
              This shop has no admin yet. Your request goes to the PartHand
              platform team for review.
            </span>
          </span>
        </label>
      )}

      <SubmitButton pending={pending} pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
