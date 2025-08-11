import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "../components/Toast";

export default function SettingsPage() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    [],
  );
  const { show } = useToast();
  const [maxConcurrency, setMaxConcurrency] = useState<number>(3);
  const [maxCost, setMaxCost] = useState<number>(10);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiBase}/settings/guardrails`);
        if (!res.ok) return;
        const data = await res.json();
        setMaxConcurrency(Number(data?.max_concurrency ?? 3));
        setMaxCost(Number(data?.max_cost_per_batch_usd ?? 10));
      } finally {
        setLoading(false);
      }
    })();
  }, [apiBase]);

  async function save() {
    try {
      const res = await fetch(`${apiBase}/settings/guardrails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_concurrency: Number(maxConcurrency),
          max_cost_per_batch_usd: Number(maxCost),
        }),
      });
      if (!res.ok) throw new Error(String(res.statusText));
      show({ title: "Saved guardrails", variant: "success" });
    } catch (e: any) {
      show({
        title: "Save failed",
        description: String(e?.message || e),
        variant: "error",
      });
    }
  }

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-3xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Settings</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-blue-600 underline">
              Dashboard
            </Link>
          </nav>
        </header>
        <section className="rounded border bg-white p-4 space-y-3">
          <div className="text-sm font-medium">Guardrails</div>
          {loading ? (
            <div className="text-sm text-gray-600">Loading…</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="text-gray-700">Max concurrency</span>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={String(maxConcurrency)}
                  onChange={(e) =>
                    setMaxConcurrency(Number(e.target.value || 1))
                  }
                />
              </label>
              <label className="text-sm">
                <span className="text-gray-700">Max cost per batch (USD)</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={String(maxCost)}
                  onChange={(e) => setMaxCost(Number(e.target.value || 0))}
                />
              </label>
              <div className="col-span-2">
                <button
                  onClick={save}
                  className="rounded bg-black px-3 py-1.5 text-white text-sm"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
