import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function HooksPage() {
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000", []);
  const [assets, setAssets] = useState<Array<{ key: string; size: number | null; last_modified: string | null; preview_url?: string }>>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiBase}/assets?prefix=dev/&limit=50`);
        if (!res.ok) return;
        const data = await res.json();
        setAssets(Array.isArray(data.items) ? data.items : []);
      } catch {}
    })();
  }, [apiBase]);
  return (
    <main className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-4xl p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Hooks</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-blue-600 underline">Dashboard</Link>
            <Link href="/brand" className="text-blue-600 underline">Brand</Link>
          </nav>
        </header>

        <section className="rounded border bg-white p-4 space-y-3">
          <div className="text-sm font-medium">Recent assets (prefix: dev/)</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="px-2 py-1">Key</th>
                  <th className="px-2 py-1">Size</th>
                  <th className="px-2 py-1">Modified</th>
                  <th className="px-2 py-1">Preview</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.key} className="border-t">
                    <td className="px-2 py-1 font-mono">{a.key}</td>
                    <td className="px-2 py-1">{a.size ?? ""}</td>
                    <td className="px-2 py-1 text-gray-600">{a.last_modified ?? ""}</td>
                    <td className="px-2 py-1">{a.preview_url ? <a className="text-blue-600 underline" href={a.preview_url} target="_blank" rel="noreferrer">open</a> : ""}</td>
                  </tr>
                ))}
                {assets.length === 0 && (
                  <tr>
                    <td className="px-2 py-3 text-gray-500" colSpan={4}>No assets found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded border bg-white p-4">
          <div className="text-sm text-gray-700">Source setup and mining UI coming next. Placeholder for Week 1.</div>
        </section>
      </div>
    </main>
  );
}


