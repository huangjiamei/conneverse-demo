"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type UploadResult = {
  shops: number;
  ros: number;
  partLines: number;
  existing: number;
  servicesSkipped: number;
  invalidSkipped: number;
};

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; result: UploadResult; fileName: string }
  | { kind: "error"; message: string };

export default function UploadRoButton() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function reset() {
    setStatus({ kind: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function close() {
    setOpen(false);
    // 成功后关闭时刷新, 让新导入的 RO 出现在列表
    if (status.kind === "success") router.refresh();
    // 稍延迟, 让关闭动画走完再 reset
    setTimeout(reset, 200);
  }

  async function handleFile(file: File) {
    setStatus({ kind: "loading" });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-ro", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setStatus({
          kind: "error",
          message: data.error || `HTTP ${res.status}`,
        });
        return;
      }
      setStatus({
        kind: "success",
        result: data as UploadResult,
        fileName: file.name,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message });
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-[#00B4A6] px-4 py-2 text-sm font-medium text-white hover:bg-[#009d91] transition-colors"
      >
        Upload RO
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#1A1A2E]">
                Upload RO
              </h2>
              <button
                onClick={close}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {status.kind === "idle" && (
              <div>
                <p className="mb-4 text-sm text-gray-600">
                  Select a CCC xlsx export. Existing ROs will be skipped.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                  className="block w-full text-sm text-gray-700
                    file:mr-4 file:rounded-md file:border-0
                    file:bg-[#1A1A2E] file:px-4 file:py-2
                    file:text-sm file:font-medium file:text-white
                    hover:file:bg-[#2a2a44] file:cursor-pointer"
                />
              </div>
            )}

            {status.kind === "loading" && (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#00B4A6]" />
                <p className="text-sm text-gray-600">Importing…</p>
              </div>
            )}

            {status.kind === "success" && (
              <div>
                <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
                  Imported <span className="font-mono">{status.fileName}</span>
                </div>
                <dl className="space-y-1.5 text-sm">
                  <Row label="Shops added" value={status.result.shops} />
                  <Row label="ROs added" value={status.result.ros} />
                  <Row
                    label="PartLines added"
                    value={status.result.partLines}
                  />
                  <Row
                    label="ROs already existed"
                    value={status.result.existing}
                    muted
                  />
                  <Row
                    label="Service rows skipped"
                    value={status.result.servicesSkipped}
                    muted
                  />
                  <Row
                    label="Invalid rows skipped"
                    value={status.result.invalidSkipped}
                    muted
                  />
                </dl>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={reset}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Upload another
                  </button>
                  <button
                    onClick={close}
                    className="rounded-md bg-[#1A1A2E] px-4 py-2 text-sm text-white hover:bg-[#2a2a44]"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {status.kind === "error" && (
              <div>
                <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
                  {status.message}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={reset}
                    className="rounded-md bg-[#1A1A2E] px-4 py-2 text-sm text-white hover:bg-[#2a2a44]"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <dt className={muted ? "text-gray-500" : "text-gray-700"}>{label}</dt>
      <dd
        className={
          muted ? "font-mono text-gray-500" : "font-mono text-[#1A1A2E]"
        }
      >
        {value}
      </dd>
    </div>
  );
}
