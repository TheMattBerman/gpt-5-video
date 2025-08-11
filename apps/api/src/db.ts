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
      job_meta jsonb,
      error_category text,
      idem_key text unique,
      payload jsonb,
      locked_at timestamptz,
      locked_by text,
      attempt_count integer not null default 0,
      next_run_at timestamptz,
      queue_wait_ms integer,
      cancelled boolean default false,
      decision text,
      decision_note text,
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
  await pool.query(`alter table jobs add column if not exists job_meta jsonb;`);
  await pool.query(
    `alter table jobs add column if not exists error_category text;`,
  );
  await pool.query(`alter table jobs add column if not exists idem_key text;`);
  await pool.query(`alter table jobs add column if not exists payload jsonb;`);
  await pool.query(
    `alter table jobs add column if not exists locked_at timestamptz;`,
  );
  await pool.query(`alter table jobs add column if not exists locked_by text;`);
  await pool.query(
    `alter table jobs add column if not exists attempt_count integer default 0;`,
  );
  await pool.query(
    `alter table jobs add column if not exists next_run_at timestamptz;`,
  );
  await pool.query(
    `alter table jobs add column if not exists queue_wait_ms integer;`,
  );
  await pool.query(
    `alter table jobs add column if not exists cancelled boolean default false;`,
  );
  await pool.query(
    `create unique index if not exists idx_jobs_idem_key on jobs(idem_key) where idem_key is not null;`,
  );
  await pool.query(`alter table jobs add column if not exists decision text;`);
  await pool.query(
    `alter table jobs add column if not exists decision_note text;`,
  );
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

  // Hooks: corpus and synth tables
  await pool.query(`
    create table if not exists hook_corpus (
      id bigserial primary key,
      mine_id text not null,
      platform text,
      author text,
      url text,
      caption_or_transcript text,
      detected_format text,
      metrics jsonb,
      scraper text,
      scrape_meta jsonb,
      created_at timestamptz default now()
    );
  `);
  await pool.query(
    `create index if not exists idx_hook_corpus_mine_id on hook_corpus(mine_id);`,
  );

  await pool.query(`
    create table if not exists hook_synth (
      id bigserial primary key,
      synth_id text not null,
      mine_id text,
      hook_text text,
      angle text,
      icp text,
      risk_flags text[],
      inspiration_url text,
      approved boolean default false,
      edited_hook_text text,
      created_at timestamptz default now()
    );
  `);
  await pool.query(
    `create index if not exists idx_hook_synth_mine_id on hook_synth(mine_id);`,
  );
  await pool.query(
    `create index if not exists idx_hook_synth_synth_id on hook_synth(synth_id);`,
  );

  // Characters and stability seeds
  await pool.query(`
    create table if not exists characters (
      id text primary key,
      data jsonb not null,
      created_at timestamptz default now()
    );
  `);
  await pool.query(`
    create table if not exists character_seeds (
      id bigserial primary key,
      character_id text,
      prompt text,
      seed bigint,
      model_version text,
      image_url text,
      created_at timestamptz default now()
    );
  `);
}

export async function insertJob(job: {
  id: string;
  type: string;
  status: string;
  startedAt?: Date | null;
  payload?: Record<string, unknown> | null;
}) {
  await pool.query(
    `insert into jobs (id, type, status, started_at, payload) values ($1, $2, $3, $4, $5) on conflict (id) do nothing`,
    [
      job.id,
      job.type,
      job.status,
      job.startedAt ? job.startedAt.toISOString() : null,
      job.payload ? JSON.stringify(job.payload) : null,
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
  errorCategory?: string | null;
  jobMeta?: Record<string, unknown> | null;
  idemKey?: string | null;
  queueWaitMs?: number | null;
  lockedAt?: Date | null;
  lockedBy?: string | null;
  payload?: Record<string, unknown> | null;
  cancelled?: boolean | null;
  attemptCount?: number | null;
  nextRunAt?: Date | null;
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
  if (job.errorCategory !== undefined) add("error_category", job.errorCategory);
  if (job.jobMeta !== undefined)
    add("job_meta", job.jobMeta ? JSON.stringify(job.jobMeta) : null);
  if (job.idemKey !== undefined) add("idem_key", job.idemKey);
  if (job.queueWaitMs !== undefined) add("queue_wait_ms", job.queueWaitMs);
  if (job.lockedAt !== undefined)
    add("locked_at", job.lockedAt ? job.lockedAt.toISOString() : null);
  if (job.lockedBy !== undefined) add("locked_by", job.lockedBy);
  if (job.payload !== undefined)
    add("payload", job.payload ? JSON.stringify(job.payload) : null);
  if (job.cancelled !== undefined) add("cancelled", job.cancelled);
  if (job.attemptCount !== undefined) add("attempt_count", job.attemptCount);
  if (job.nextRunAt !== undefined)
    add("next_run_at", job.nextRunAt ? job.nextRunAt.toISOString() : null);
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
    `select j.*,
            coalesce(json_agg(a.*) filter (where a.id is not null), '[]') as artifacts,
            coalesce(sum(c.amount_usd) filter (where c.id is not null), 0) as cost_usd
     from jobs j
     left join artifacts a on a.job_id = j.id
     left join cost_ledger c on c.job_id = j.id
     group by j.id
     order by j.created_at desc
     limit $1`,
    [limit],
  );
  return rows;
}

export async function countQueuedJobs() {
  const { rows } = await pool.query(
    `select count(*)::int as c from jobs where status = 'queued'`,
  );
  return rows[0]?.c ?? 0;
}

export async function countProcessingJobs() {
  const { rows } = await pool.query(
    `select count(*)::int as c from jobs where status = 'processing'`,
  );
  return rows[0]?.c ?? 0;
}

export async function getKpisToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();
  const inProgressP = pool.query(
    `select count(*)::int as c from jobs where status in ('queued','processing')`,
  );
  const processingCountP = pool.query(
    `select count(*)::int as c from jobs where status = 'processing'`,
  );
  const queuedCountP = pool.query(
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
  const failuresByCatP = pool.query(
    `select error_category, count(*)::int as c from jobs where status = 'failed' and created_at >= $1 group by error_category`,
    [startIso],
  );
  const avgQueueWaitP = pool.query(
    `select coalesce(round(avg(queue_wait_ms))::int, 0) as avg from jobs where started_at is not null and created_at >= $1`,
    [startIso],
  );
  const [inProgress, failures, avgRender, spend, failuresByCat, avgQueueWait] =
    await Promise.all([
      inProgressP,
      failuresP,
      avgRenderP,
      spendP,
      failuresByCatP,
      avgQueueWaitP,
      processingCountP,
      queuedCountP,
    ]);
  return {
    in_progress: inProgress.rows[0]?.c ?? 0,
    failures: failures.rows[0]?.c ?? 0,
    avg_render_time_ms: avgRender.rows[0]?.avg ?? 0,
    spend_today_usd: spend.rows[0]?.s ?? 0,
    failures_by_category: (failuresByCat.rows || []).reduce(
      (acc: Record<string, number>, r: any) => {
        const k = r.error_category || "unknown";
        acc[k] = Number(r.c || 0);
        return acc;
      },
      {},
    ),
    avg_queue_wait_ms: avgQueueWait.rows[0]?.avg ?? 0,
    processing_count: (processingCountP as any).rows?.[0]?.c ?? 0,
    queued_count: (queuedCountP as any).rows?.[0]?.c ?? 0,
  };
}

export async function getJobDetail(id: string) {
  const { rows } = await pool.query(
    `select j.*,
            coalesce(json_agg(a.*) filter (where a.id is not null), '[]') as artifacts,
            coalesce(sum(c.amount_usd) filter (where c.id is not null), 0) as cost_usd,
            coalesce(json_agg(c.*) filter (where c.id is not null), '[]') as costs
     from jobs j
     left join artifacts a on a.job_id = j.id
     left join cost_ledger c on c.job_id = j.id
     where j.id = $1
     group by j.id`,
    [id],
  );
  return rows[0] || null;
}

export async function findJobByIdemKey(type: string, idemKey: string) {
  const { rows } = await pool.query(
    `select * from jobs where type = $1 and idem_key = $2 limit 1`,
    [type, idemKey],
  );
  return rows[0] || null;
}

export async function enqueueJob(row: {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  idemKey?: string | null;
  jobMeta?: Record<string, unknown> | null;
}) {
  await pool.query(
    `insert into jobs (id, type, status, started_at, payload, idem_key, job_meta)
     values ($1, $2, 'queued', now(), $3, $4, $5)
     on conflict (id) do nothing`,
    [
      row.id,
      row.type,
      JSON.stringify(row.payload),
      row.idemKey || null,
      row.jobMeta ? JSON.stringify(row.jobMeta) : null,
    ],
  );
}

export async function claimNextQueuedJob(types: string[], workerId: string) {
  // Optimistic claim: pick oldest queued job of supported type
  const { rows } = await pool.query(
    `select id from jobs where status = 'queued' and cancelled = false and type = any($1)
     and (next_run_at is null or next_run_at <= now())
     order by coalesce(next_run_at, created_at) asc, created_at asc limit 1`,
    [types],
  );
  const id = rows[0]?.id as string | undefined;
  if (!id) return null;
  const lockRes = await pool.query(
    `update jobs set status = 'processing', locked_by = $2, locked_at = now(), started_at = coalesce(started_at, now()), queue_wait_ms = extract(epoch from (now() - created_at))::int * 1000
     where id = $1 and status = 'queued' and cancelled = false and locked_at is null
     returning *`,
    [id, workerId],
  );
  return lockRes.rows[0] || null;
}

export async function getJobPayload(id: string) {
  const { rows } = await pool.query(`select payload from jobs where id = $1`, [
    id,
  ]);
  return rows[0]?.payload || null;
}

export async function cancelJob(id: string) {
  const { rows } = await pool.query(
    `update jobs set status = 'cancelled', cancelled = true, completed_at = now() where id = $1 and status = 'queued' returning *`,
    [id],
  );
  return rows[0] || null;
}

export async function insertHookCorpusItems(
  mineId: string,
  items: Array<{
    platform?: string;
    author?: string;
    url?: string;
    caption_or_transcript?: string;
    detected_format?: string;
    metrics?: unknown;
    scraper?: string;
    scrape_meta?: unknown;
  }>,
) {
  if (!items?.length) return;
  const text = `insert into hook_corpus
    (mine_id, platform, author, url, caption_or_transcript, detected_format, metrics, scraper, scrape_meta)
    values ${items
      .map(
        (_i, idx) =>
          `($${idx * 9 + 1}, $${idx * 9 + 2}, $${idx * 9 + 3}, $${idx * 9 + 4}, $${idx * 9 + 5}, $${idx * 9 + 6}, $${idx * 9 + 7}, $${idx * 9 + 8}, $${idx * 9 + 9})`,
      )
      .join(", ")}`;
  const values: any[] = [];
  for (const it of items) {
    values.push(
      mineId,
      it.platform || null,
      it.author || null,
      it.url || null,
      it.caption_or_transcript || null,
      it.detected_format || null,
      it.metrics ? JSON.stringify(it.metrics) : null,
      it.scraper || null,
      it.scrape_meta ? JSON.stringify(it.scrape_meta) : null,
    );
  }
  await pool.query(text, values);
}

export async function listHookCorpus(params: {
  mineId?: string;
  limit?: number;
  offset?: number;
  sort?: string; // e.g., 'views:desc' or 'created_at:desc'
}) {
  const limit = Math.min(Math.max(1, Number(params.limit || 50)), 500);
  const offset = Math.max(0, Number(params.offset || 0));
  const args: any[] = [];
  let where = "";
  if (params.mineId) {
    args.push(params.mineId);
    where = `where mine_id = $${args.length}`;
  }
  // Sorting
  const sort = String(params.sort || "");
  let order = "id desc";
  if (/^views:desc$/i.test(sort))
    order = "(coalesce((metrics->>'views')::int,0)) desc, id desc";
  else if (/^views:asc$/i.test(sort))
    order = "(coalesce((metrics->>'views')::int,0)) asc, id desc";
  else if (/^created_at:asc$/i.test(sort)) order = "created_at asc";
  else if (/^created_at:desc$/i.test(sort)) order = "created_at desc";
  const { rows } = await pool.query(
    `select * from hook_corpus ${where} order by ${order} limit $${args.push(
      limit,
    )} offset $${args.push(offset)}`,
    args,
  );
  return rows;
}

export async function insertHookSynthItems(
  synthId: string,
  mineId: string | null,
  items: Array<{
    hook_text?: string;
    angle?: string;
    icp?: string;
    risk_flags?: string[];
    inspiration_url?: string;
  }>,
) {
  if (!items?.length) return;
  const text = `insert into hook_synth
    (synth_id, mine_id, hook_text, angle, icp, risk_flags, inspiration_url)
    values ${items
      .map(
        (_i, idx) =>
          `($${idx * 7 + 1}, $${idx * 7 + 2}, $${idx * 7 + 3}, $${idx * 7 + 4}, $${idx * 7 + 5}, $${idx * 7 + 6}, $${idx * 7 + 7})`,
      )
      .join(", ")}`;
  const values: any[] = [];
  for (const it of items) {
    values.push(
      synthId,
      mineId,
      it.hook_text || null,
      it.angle || null,
      it.icp || null,
      it.risk_flags
        ? `{${it.risk_flags.map((s) => `"${s}"`).join(",")}}`
        : null,
      it.inspiration_url || null,
    );
  }
  await pool.query(text, values);
}

export async function listHookSynth(params: {
  mineId?: string;
  synthId?: string;
  limit?: number;
  offset?: number;
  approved?: boolean;
  icp?: string;
  sort?: string; // e.g., 'created_at:desc'
}) {
  const limit = Math.min(Math.max(1, Number(params.limit || 50)), 500);
  const offset = Math.max(0, Number(params.offset || 0));
  const clauses: string[] = [];
  const args: any[] = [];
  if (params.mineId) {
    args.push(params.mineId);
    clauses.push(`mine_id = $${args.length}`);
  }
  if (params.synthId) {
    args.push(params.synthId);
    clauses.push(`synth_id = $${args.length}`);
  }
  if (typeof params.approved === "boolean") {
    args.push(params.approved);
    clauses.push(`approved = $${args.length}`);
  }
  if (params.icp) {
    args.push(params.icp);
    clauses.push(`icp = $${args.length}`);
  }
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const sort = String(params.sort || "");
  let order = "id desc";
  if (/^created_at:asc$/i.test(sort)) order = "created_at asc";
  else if (/^created_at:desc$/i.test(sort)) order = "created_at desc";
  else if (/^approved:asc$/i.test(sort)) order = "approved asc, id desc";
  else if (/^approved:desc$/i.test(sort)) order = "approved desc, id desc";
  const { rows } = await pool.query(
    `select * from hook_synth ${where} order by ${order} limit $${args.push(
      limit,
    )} offset $${args.push(offset)}`,
    args,
  );
  return rows;
}

export async function updateHookSynth(
  id: number,
  fields: {
    hook_text?: string;
    angle?: string;
    icp?: string;
    risk_flags?: string[];
    approved?: boolean;
    edited_hook_text?: string | null;
  },
) {
  const sets: string[] = [];
  const args: any[] = [id];
  let i = 1;
  const add = (col: string, val: any) => {
    sets.push(`${col} = $${++i}`);
    args.push(val);
  };
  if (fields.hook_text !== undefined) add("hook_text", fields.hook_text);
  if (fields.angle !== undefined) add("angle", fields.angle);
  if (fields.icp !== undefined) add("icp", fields.icp);
  if (fields.risk_flags !== undefined)
    add(
      "risk_flags",
      fields.risk_flags
        ? `{${fields.risk_flags.map((s) => `"${s}"`).join(",")}}`
        : null,
    );
  if (fields.approved !== undefined) add("approved", fields.approved);
  if (fields.edited_hook_text !== undefined)
    add("edited_hook_text", fields.edited_hook_text);
  if (!sets.length) return;
  await pool.query(
    `update hook_synth set ${sets.join(", ")} where id = $1`,
    args,
  );
}

export async function insertCharacterProfile(id: string, data: unknown) {
  await pool.query(
    `insert into characters (id, data) values ($1, $2) on conflict (id) do update set data = excluded.data`,
    [id, JSON.stringify(data)],
  );
}

export async function insertCharacterSeeds(
  characterId: string | null,
  seeds: Array<{
    prompt: string;
    seed?: number | null;
    model_version?: string | null;
    image_url?: string | null;
  }>,
) {
  if (!seeds?.length) return;
  const text = `insert into character_seeds (character_id, prompt, seed, model_version, image_url) values ${seeds
    .map(
      (_, i) =>
        `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`,
    )
    .join(", ")}`;
  const values: any[] = [];
  for (const s of seeds) {
    values.push(
      characterId,
      s.prompt || null,
      s.seed ?? null,
      s.model_version || null,
      s.image_url || null,
    );
  }
  await pool.query(text, values);
}
