-- Transactional enqueue for the application role (ADR 0006, P0-05). A command writes its state, its event and
-- the job it triggers in one transaction; if it rolls back, the job is gone too.
-- `nirvana_app` gets this single entry point and no right on Graphile's own tables. SECURITY DEFINER runs it as
-- the owner (`nirvana_admin`, who owns the `graphile_worker` schema, created by Graphile when the worker or the
-- API starts). `search_path` is pinned so that the caller cannot shadow a function.
CREATE FUNCTION public.enqueue_job(
  task text,
  payload jsonb,
  queue_name text DEFAULT NULL,
  run_at timestamptz DEFAULT NULL,
  max_attempts integer DEFAULT NULL,
  job_key text DEFAULT NULL,
  job_key_mode text DEFAULT 'replace'
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  job_id bigint;
BEGIN
  SELECT (graphile_worker.add_job(
    identifier => task,
    payload => payload::json,
    queue_name => queue_name,
    run_at => run_at,
    max_attempts => max_attempts,
    job_key => job_key,
    job_key_mode => job_key_mode
  )).id INTO job_id;
  RETURN job_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enqueue_job(text, jsonb, text, timestamptz, integer, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.enqueue_job(text, jsonb, text, timestamptz, integer, text, text) TO nirvana_app;
