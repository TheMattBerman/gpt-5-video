export type JobType =
  | "hooks_mine"
  | "hooks_synthesize"
  | "scene_render"
  | "video_assemble";
export type JobStatus = "queued" | "succeeded" | "failed";

export interface JobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  createdAt: number; // ms epoch
  completedAt?: number; // ms epoch
  durationMs?: number;
  predictionId?: string;
  modelVersion?: string;
  seed?: number | null;
  runId?: string;
  error?: string;
  costUsd?: number; // placeholder for future
}

const STORAGE_KEY = "gpt5video_jobs";
const MAX_JOBS = 200;

function readStorage(): JobRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as JobRecord[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(jobs: JobRecord[]) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = jobs
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, MAX_JOBS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

export function listJobs(): JobRecord[] {
  return readStorage();
}

export function addJob(job: JobRecord) {
  const jobs = readStorage();
  const without = jobs.filter((j) => j.id !== job.id);
  writeStorage([job, ...without]);
}

export function updateJob(id: string, partial: Partial<JobRecord>) {
  const jobs = readStorage();
  const next = jobs.map((j) => (j.id === id ? { ...j, ...partial } : j));
  writeStorage(next);
}

export function computeKpis() {
  const jobs = readStorage();
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startMs = startOfDay.getTime();

  const inProgress = jobs.filter((j) => j.status === "queued").length;
  const failures = jobs.filter(
    (j) => j.status === "failed" && j.createdAt >= startMs,
  ).length;
  const renderJobs = jobs.filter(
    (j) =>
      (j.type === "scene_render" || j.type === "video_assemble") &&
      j.status === "succeeded" &&
      typeof j.durationMs === "number",
  );
  const avgRenderTime =
    renderJobs.length > 0
      ? Math.round(
          renderJobs.reduce((sum, j) => sum + (j.durationMs || 0), 0) /
            renderJobs.length,
        )
      : 0;

  // Placeholder for spend today; future: sum costUsd for jobs today
  const spendTodayUsd = 0;

  return {
    inProgress,
    failures,
    avgRenderTimeMs: avgRenderTime,
    spendTodayUsd,
    totalJobs: jobs.length,
    lastUpdated: now,
  };
}
