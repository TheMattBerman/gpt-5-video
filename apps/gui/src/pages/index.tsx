import { useEffect, useState } from "react";

export default function Home() {
  const [ping, setPing] = useState<string>("connecting...");
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
    const es = new EventSource(`${url}/jobs/stream`);
    es.addEventListener("ping", (ev) => setPing((ev as MessageEvent).data));
    es.onerror = () => setPing("disconnected");
    return () => es.close();
  }, []);
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
      <div>
        <h1>All-Replicate Content Engine</h1>
        <p>SSE status: {ping}</p>
      </div>
    </main>
  );
}

