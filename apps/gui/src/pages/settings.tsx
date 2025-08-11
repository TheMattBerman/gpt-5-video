import Link from "next/link";
import PageHeader from "../components/PageHeader";
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
  const [saving, setSaving] = useState<boolean>(false);
  const [token, setToken] = useState<string>("");

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
    try {
      const t = localStorage.getItem("gpt5video_token") || "";
      setToken(t);
    } catch {}
  }, [apiBase]);

  async function save() {
    // Optimistic update
    setSaving(true);
    const prev = { maxConcurrency, maxCost };
    try {
      show({ title: "Saving…" });
      const res = await fetch(`${apiBase}/settings/guardrails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_concurrency: Number(maxConcurrency),
          max_cost_per_batch_usd: Number(maxCost),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // revert
        setMaxConcurrency(prev.maxConcurrency);
        setMaxCost(prev.maxCost);
        throw new Error(String(data?.details || data?.error || res.statusText));
      }
      show({ title: "Saved guardrails", variant: "success" });
      try {
        // Notify other pages (e.g., Dashboard) to refresh guardrails tile
        window.dispatchEvent(new CustomEvent("gpt5video_guardrails_updated"));
      } catch {}
    } catch (e: any) {
      show({
        title: "Save failed",
        description: String(e?.message || e),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-3xl p-6 space-y-6">
        <PageHeader
          title="Settings"
          description="Configure guardrails and auth token. Changes apply immediately across the app."
        />
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
                  className="rounded bg-black px-3 py-1.5 text-white text-sm disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded border bg-white p-4 space-y-3">
          <div className="text-sm font-medium">Auth (JWT)</div>
          <div className="text-xs text-gray-600">
            When not in development, protected routes require a Bearer token.
            Store a token locally to be sent with protected requests.
          </div>
          <div className="grid grid-cols-1 gap-3">
            <label className="text-sm">
              <span className="text-gray-700">Token</span>
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm font-mono"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="paste token"
              />
            </label>
            <div>
              <button
                onClick={() => {
                  try {
                    localStorage.setItem("gpt5video_token", token.trim());
                    show({ title: "Token saved", variant: "success" });
                  } catch {
                    show({ title: "Save failed", variant: "error" });
                  }
                }}
                className="rounded bg-black px-3 py-1.5 text-white text-sm mr-2"
              >
                Save token
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem("gpt5video_token");
                    setToken("");
                    show({ title: "Token cleared", variant: "success" });
                  } catch {
                    show({ title: "Clear failed", variant: "error" });
                  }
                }}
                className="rounded border px-3 py-1.5 text-sm"
              >
                Clear token
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
