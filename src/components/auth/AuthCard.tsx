/**
 * 登录 / 注册 / 待审核 三个页面共用的居中卡片外壳。
 * 品牌样式沿用 AppHeader: navy 标题 + teal 副标。
 */

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex-1 flex items-start justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-[420px]">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-7 sm:p-8">
          <h1 className="text-xl font-semibold text-[#1A1A2E]">{title}</h1>
          {subtitle && (
            <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
              {subtitle}
            </p>
          )}
          <div className="mt-6">{children}</div>
        </div>
        {footer && (
          <div className="mt-5 text-center text-sm text-gray-500">{footer}</div>
        )}
      </div>
    </main>
  );
}

// ---- 表单原子件 (三个页面复用同一套外观) ----

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[13px] font-medium text-[#1A1A2E] mb-1.5"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-[#1A1A2E] " +
  "placeholder:text-gray-400 focus:outline-none focus:border-[#00B4A6] " +
  "focus:ring-2 focus:ring-[#00B4A6]/25 transition disabled:bg-gray-50";

export const inputErrorClass =
  "w-full px-3 py-2 rounded-lg border border-red-400 text-sm text-[#1A1A2E] " +
  "placeholder:text-gray-400 focus:outline-none focus:border-red-500 " +
  "focus:ring-2 focus:ring-red-500/20 transition disabled:bg-gray-50";

export function SubmitButton({
  pending,
  children,
  pendingLabel,
}: {
  pending: boolean;
  children: React.ReactNode;
  pendingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 rounded-lg bg-[#00B4A6] text-white text-sm font-semibold
                 hover:bg-[#00A396] disabled:opacity-60 disabled:cursor-not-allowed transition"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700"
    >
      {message}
    </div>
  );
}
