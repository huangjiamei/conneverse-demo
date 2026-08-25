"use client";

/**
 * "Book a demo" 弹窗 —— 全页共用一个实例。
 *
 * 页面上有四处 Book a demo (nav / hero / 末尾 CTA / footer),各自渲染一个弹窗
 * 会在 DOM 里堆四份同样的东西。所以用 context:provider 持有唯一的 dialog,
 * 触发点只管调 open()。
 *
 * 提交打 POST /api/demo-request,那边用现成的 sendEmail 发给平台邮箱。
 * 这一批只做这一个后端动作,别的都不接。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Loader2, X } from "lucide-react";

const DemoDialogContext = createContext<{ open: () => void } | null>(null);

/** 触发点调它拿 open();provider 之外调用会抛,免得静默失效 */
export function useDemoDialog() {
  const ctx = useContext(DemoDialogContext);
  if (!ctx) {
    throw new Error("useDemoDialog must be used inside <DemoDialogProvider>");
  }
  return ctx;
}

type Status = "idle" | "sending" | "sent";

export function DemoDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const open = useCallback(() => {
    setStatus("idle");
    setError(null);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  // Esc 关闭 + 打开时锁住背景滚动 + 焦点落到第一个输入框
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const form = new FormData(e.currentTarget);
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          shop: form.get("shop"),
          email: form.get("email"),
          phone: form.get("phone"),
          message: form.get("message"),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not send your request. Please try again.");
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Network error. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <DemoDialogContext.Provider value={{ open }}>
      {children}

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-10 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Book a demo"
          onMouseDown={(e) => {
            // 只在点到遮罩本身时关 —— 在表单里按下、拖到外面松手不算
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="relative w-full max-w-[520px] rounded-[16px] border border-line bg-paper-2 p-7 shadow-[0_40px_80px_-40px_rgba(0,0,0,.6)] sm:p-9">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full p-1.5 text-muted transition hover:bg-black/5 hover:text-text-ink"
            >
              <X size={18} />
            </button>

            {status === "sent" ? (
              <div className="py-4">
                <h2 className="font-serif-ph text-[26px] font-semibold leading-[1.1] tracking-[-0.01em] text-text-ink">
                  Thanks — we&apos;ll be in touch.
                </h2>
                <p className="mt-3 font-serif-ph text-[17px] leading-[1.6] text-text-soft">
                  Someone from PartHand will reach out to set up a time. If it&apos;s
                  urgent, reply to the confirmation and we&apos;ll move faster.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-7 w-full rounded-full bg-ink py-3 font-serif-ph text-[16px] font-semibold text-text-light transition hover:bg-ink-2"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h2 className="font-serif-ph text-[26px] font-semibold leading-[1.1] tracking-[-0.01em] text-text-ink">
                  Book a demo
                </h2>
                <p className="mt-2.5 font-serif-ph text-[16.5px] leading-[1.55] text-text-soft">
                  Tell us about your shop and we&apos;ll show you what PartHand finds
                  on a job you sourced last week.
                </p>

                <form onSubmit={onSubmit} className="mt-6 space-y-3.5" noValidate>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <DemoField label="Name" htmlFor="demo-name">
                      <input
                        ref={firstFieldRef}
                        id="demo-name"
                        name="name"
                        required
                        autoComplete="name"
                        className={DEMO_INPUT}
                        placeholder="Alex Rivera"
                      />
                    </DemoField>
                    <DemoField label="Shop" htmlFor="demo-shop">
                      <input
                        id="demo-shop"
                        name="shop"
                        autoComplete="organization"
                        className={DEMO_INPUT}
                        placeholder="Bay Auto Care"
                      />
                    </DemoField>
                  </div>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <DemoField label="Work email" htmlFor="demo-email">
                      <input
                        id="demo-email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        className={DEMO_INPUT}
                        placeholder="you@shop.com"
                      />
                    </DemoField>
                    <DemoField label="Phone" htmlFor="demo-phone" optional>
                      <input
                        id="demo-phone"
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        className={DEMO_INPUT}
                        placeholder="(555) 019-2837"
                      />
                    </DemoField>
                  </div>
                  <DemoField label="Anything we should know?" htmlFor="demo-message" optional>
                    <textarea
                      id="demo-message"
                      name="message"
                      rows={3}
                      className={`${DEMO_INPUT} resize-none`}
                      placeholder="Systems you run on, volume, what's slowing you down…"
                    />
                  </DemoField>

                  {error && (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 font-serif-ph text-[14px] text-red-700"
                    >
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full bg-leaf py-3 font-serif-ph text-[17px] font-semibold text-[#14170a] transition hover:bg-[#b2df6d] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {status === "sending" && (
                      <Loader2 size={16} className="animate-spin" />
                    )}
                    {status === "sending" ? "Sending…" : "Request a demo"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </DemoDialogContext.Provider>
  );
}

const DEMO_INPUT =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 font-serif-ph text-[16px] " +
  "text-text-ink placeholder:text-muted focus:border-leaf-deep focus:outline-none " +
  "focus:ring-2 focus:ring-leaf/35 transition";

function DemoField({
  label,
  htmlFor,
  optional = false,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block font-mono-ph text-[11px] uppercase tracking-[0.14em] text-muted"
      >
        {label}
        {optional && <span className="ml-1 normal-case tracking-normal">(optional)</span>}
      </label>
      {children}
    </div>
  );
}
