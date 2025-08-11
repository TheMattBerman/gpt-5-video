import { Pool } from "pg";

const connectionString =
  process.env.POSTGRES_URL ||
  "postgres://postgres:postgres@localhost:5432/gpt5video";
export const pool = new Pool({ connectionString });

export async function ensureTables() {
  await pool.query(`
    create table if not exists jobs (
      id text primary key,
      type text not null,
      status text not null,
      prediction_id text,
      model_version text,
      run_id text,
      seed bigint,
      started_at timestamptz,
      completed_at timestamptz,
      duration_ms integer,
      error text,
      created_at timestamptz default now()
    );
  `);
  await pool.query(
    `create index if not exists idx_jobs_created_at on jobs(created_at desc);`,
  );
  // Backfill column if schema existed before
  await pool.query(`alter table jobs add column if not exists error text;`);
  await pool.query(`
    create table if not exists artifacts (
      id bigserial primary key,
      job_id text not null references jobs(id) on delete cascade,
      type text,
      url text,
      key text,
      created_at timestamptz default now()
    );
  `);
  await pool.query(
    `create index if not exists idx_artifacts_job_id on artifacts(job_id);`,
  );
  await pool.query(`
    create table if not exists cost_ledger (
      id bigserial primary key,
      job_id text not null references jobs(id) on delete cascade,
      provider text,
      amount_usd numeric(10,2) not null default 0,
      meta jsonb,
      created_at timestamptz default now()
    );
  `);
  await pool.query(
    `create index if not exists idx_cost_ledger_job_id on cost_ledger(job_id);`,
  );
}

export async function insertJob(job: {
  id: string;
  type: string;
  status: string;
  startedAt?: Date | null;
}) {
  await pool.query(
    `insert into jobs (id, type, status, started_at) values ($1, $2, $3, $4) on conflict (id) do nothing`,
    [
      job.id,
      job.type,
      job.status,
      job.startedAt ? job.startedAt.toISOString() : null,
    ],
  );
}

export async function updateJob(job: {
  id: string;
  status?: string;
  predictionId?: string | null;
  modelVersion?: string | null;
  runId?: string | null;
  seed?: number | null;
  completedAt?: Date | null;
  durationMs?: number | null;
  error?: string | null;
}) {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;
  const add = (col: string, val: any) => {
    fields.push(`${col} = $${++idx}`);
    values.push(val);
  };
  values.push(job.id);
  if (job.status !== undefined) add("status", job.status);
  if (job.predictionId !== undefined) add("prediction_id", job.predictionId);
  if (job.modelVersion !== undefined) add("model_version", job.modelVersion);
  if (job.runId !== undefined) add("run_id", job.runId);
  if (job.seed !== undefined) add("seed", job.seed);
  if (job.completedAt !== undefined)
    add("completed_at", job.completedAt ? job.completedAt.toISOString() : null);
  if (job.durationMs !== undefined) add("duration_ms", job.durationMs);
  if (job.error !== undefined) add("error", job.error);
  if (!fields.length) return;
  await pool.query(
    `update jobs set ${fields.join(", ")} where id = $1`,
    values,
  );
}

export async function insertArtifact(row: {
  jobId: string;
  type?: string | null;
  url?: string | null;
  key?: string | null;
}) {
  await pool.query(
    `insert into artifacts (job_id, type, url, key) values ($1, $2, $3, $4)`,
    [row.jobId, row.type || null, row.url || null, row.key || null],
  );
}

export async function insertCost(row: {
  jobId: string;
  provider?: string | null;
  amountUsd?: number;
  meta?: any;
}) {
  await pool.query(
    `insert into cost_ledger (job_id, provider, amount_usd, meta) values ($1, $2, $3, $4)`,
    [
      row.jobId,
      row.provider || null,
      row.amountUsd || 0,
      row.meta ? JSON.stringify(row.meta) : null,
    ],
  );
}

export async function getRecentJobs(limit = 50) {
  const { rows } = await pool.query(
    `select j.*, coalesce(json_agg(a.*) filter (where a.id is not null), '[]') as artifacts
     from jobs j
     left join artifacts a on a.job_id = j.id
     group by j.id
     order by j.created_at desc
     limit $1`,
    [limit],
  );
  return rows;
}

export async function getKpisToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();
  const inProgressP = pool.query(
    `select count(*)::int as c from jobs where status = 'queued'`,
  );
  const failuresP = pool.query(
    `select count(*)::int as c from jobs where status = 'failed' and created_at >= $1`,
    [startIso],
  );
  const avgRenderP = pool.query(
    `select coalesce(round(avg(duration_ms))::int, 0) as avg from jobs where status = 'succeeded' and type in ('scene_render','video_assemble') and duration_ms is not null and created_at >= $1`,
    [startIso],
  );
  const spendP = pool.query(
    `select coalesce(sum(amount_usd), 0)::float as s from cost_ledger where created_at >= $1`,
    [startIso],
  );
  const [inProgress, failures, avgRender, spend] = await Promise.all([
    inProgressP,
    failuresP,
    avgRenderP,
    spendP,
  ]);
  return {
    in_progress: inProgress.rows[0]?.c ?? 0,
    failures: failures.rows[0]?.c ?? 0,
    avg_render_time_ms: avgRender.rows[0]?.avg ?? 0,
    spend_today_usd: spend.rows[0]?.s ?? 0,
  };
}
