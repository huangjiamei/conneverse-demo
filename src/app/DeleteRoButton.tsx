"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  roId: string;
  cccRoNumber: string;
  vehicleLabel: string;
};

export default function DeleteRoButton({
  roId,
  cccRoNumber,
  vehicleLabel,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/repair-orders/${roId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        setDeleting(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirming(true);
        }}
        className="absolute top-2 right-2 z-10 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Delete repair order"
        title="Delete repair order"
      >
        ✕
      </button>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!deleting) setConfirming(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-semibold text-[#1A1A2E]">
              Delete this repair order?
            </h2>
            <p className="mb-1 text-sm text-gray-600">
              This cannot be undone. All part lines, searches, and candidates
              under this RO will be removed.
            </p>
            <p className="mb-4 text-sm font-medium text-[#1A1A2E]">
              RO #{cccRoNumber} · {vehicleLabel}
            </p>

            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setConfirming(false);
                }}
                disabled={deleting}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDelete();
                }}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
