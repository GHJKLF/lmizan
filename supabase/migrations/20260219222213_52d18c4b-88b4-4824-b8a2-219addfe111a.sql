
-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the worker heartbeat: every minute, invoke process-sync-chunk 3 times in parallel
-- NOTE: The admin must set these database settings first:
--   ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
SELECT cron.schedule(
  'sync-worker-heartbeat',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/process-sync-chunk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) FROM generate_series(1, 3);
  $$
);

-- Schedule daily cleanup at 3 AM: remove old completed jobs (7d) and old webhook events (30d)
SELECT cron.schedule(
  'sync-cleanup',
  '0 3 * * *',
  $$
  DELETE FROM sync_jobs WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '7 days';
  DELETE FROM sync_jobs WHERE status = 'failed' AND created_at < NOW() - INTERVAL '30 days';
  DELETE FROM webhook_events WHERE processed_at < NOW() - INTERVAL '30 days';
  $$
);
