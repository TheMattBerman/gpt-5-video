import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Tooltip from "./ui/Tooltip";

export type QuickTourStep = {
  id: string;
  title: string;
  description?: string;
};

export default function QuickTour({
  steps,
  storageKey = "gpt5video_quick_tour_dismissed",
}: {
  steps: QuickTourStep[];
  storageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const dismissed = useMemo(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  }, [storageKey]);

  useEffect(() => {
    if (!dismissed && steps.length > 0) setOpen(true);
  }, [dismissed, steps.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight")
        setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length]);

  if (dismissed || !open) return null;
  const step = steps[index];
  if (!step) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-none">
      <div className="pointer-events-auto mb-6 w-[520px] rounded-md border bg-white p-4 shadow-elevated">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {step.title}
            </div>
            {step.description && (
              <div className="mt-1 text-sm text-gray-700">
                {step.description}
              </div>
            )}
          </div>
          <button
            className="text-xs opacity-70 hover:opacity-100"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-gray-600">
            Step {index + 1} of {steps.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded border px-2 py-1 text-xs"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
            >
              Back
            </button>
            <button
              className="rounded border px-2 py-1 text-xs"
              onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
              disabled={index === steps.length - 1}
            >
              Next
            </button>
            <button
              className="rounded bg-black px-2.5 py-1 text-white text-xs"
              onClick={() => {
                try {
                  window.localStorage.setItem(storageKey, "1");
                } catch {}
                setOpen(false);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-gray-500">
          Tip: Press Esc to exit
        </div>
      </div>
    </div>
  );
}
