# pg-boss queue: retries and idempotency

## Retry behavior

Jobs are enqueued in [`src/services/queue/index.js`](../src/services/queue/index.js) with:

- `retryLimit: 2` — after a handler failure, pg-boss may run the job again up to two additional attempts (exact semantics depend on pg-boss version).
- `retryDelay: 10` — backoff between attempts.
- `expireInMinutes: 60` — jobs that never complete within this window expire.

If the **Node worker process** exits uncleanly mid-job (e.g. `SIGKILL`), pg-boss typically marks the job for retry when the worker restarts, subject to retry limits and expiration.

**Operational:** Run workers under a supervisor (systemd, Fly `worker` process, Kubernetes) so crashes trigger automatic restart.

## Idempotency caveat

The generation handler runs [`ProjectGenerationService.generateProject`](../src/services/projectGeneration.js) with a stable `generationId` (the job’s `jobId`). **Retries are not automatically idempotent:** a second run may repeat partial writes to storage or leave mixed artifacts if the first attempt failed after some files were written.

Mitigations for production:

- Treat storage paths as owned by `jobId` and delete or overwrite consistently at job start (future hardening).
- Or mark the job as non-retryable after partial success (custom pg-boss policy).
- Prefer monitoring + manual re-queue for failed jobs until idempotency is guaranteed.

## Inspecting job state (PostgreSQL)

pg-boss stores jobs in the database; table/schema names vary by version. Use `\dt *pgboss*` or the [pg-boss docs](https://github.com/timgit/pg-boss) for your installed version when querying job rows.

## Session locks vs async jobs

The HTTP API uses an **in-memory lock** only within the API process. For **202 Accepted** async generation, the API **releases that lock immediately after enqueue** and relies on **`hasActiveGenerationForSession`** (backed by `projects` rows with `pending` / `generating`) to block duplicate submissions for the same session while a job is still active.

**Cross-instance atomicity:** migration `005_one_active_job_per_session.sql` adds a **partial unique index** on `projects(session_id)` where `status IN ('pending','generating')`. `createGenerationRecord` maps Postgres `23505` to **409 Conflict**, so two requests hitting different app instances cannot both insert an active job for the same session.
