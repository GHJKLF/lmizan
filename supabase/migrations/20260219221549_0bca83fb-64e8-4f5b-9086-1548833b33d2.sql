
-- 1. sync_jobs table
CREATE TABLE public.sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('paypal', 'wise', 'stripe')),
  connection_id UUID NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('historical', 'incremental', 'webhook')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  chunk_start TIMESTAMPTZ,
  chunk_end TIMESTAMPTZ,
  cursor TEXT,
  records_processed INT DEFAULT 0,
  total_estimated INT,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  priority INT DEFAULT 10,
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_jobs_claim ON public.sync_jobs(status, priority, created_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_sync_jobs_user ON public.sync_jobs(user_id, provider, status);
CREATE INDEX idx_sync_jobs_session ON public.sync_jobs(session_id);

-- 2. sync_sessions table
CREATE TABLE public.sync_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL,
  provider TEXT NOT NULL,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('historical', 'incremental')),
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  total_chunks INT DEFAULT 0,
  completed_chunks INT DEFAULT 0,
  total_records INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_sessions_connection ON public.sync_sessions(connection_id, status);

-- 3. webhook_events table
CREATE TABLE public.webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (provider, event_id)
);

-- 4. Add columns to transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_provider_unique ON public.transactions(user_id, provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

-- 5. claim_next_sync_job function
CREATE OR REPLACE FUNCTION public.claim_next_sync_job()
RETURNS public.sync_jobs AS $$
DECLARE
  claimed public.sync_jobs;
BEGIN
  SELECT * INTO claimed
  FROM public.sync_jobs
  WHERE status = 'pending'
    AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    AND attempts < max_attempts
  ORDER BY priority ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF claimed.id IS NOT NULL THEN
    UPDATE public.sync_jobs SET
      status = 'running',
      started_at = NOW(),
      attempts = attempts + 1
    WHERE id = claimed.id
    RETURNING * INTO claimed;
  END IF;

  RETURN claimed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. update_sync_session_progress function
CREATE OR REPLACE FUNCTION public.update_sync_session_progress(p_session_id UUID)
RETURNS void AS $$
DECLARE
  v_total INT;
  v_completed INT;
  v_records INT;
  v_failed INT;
BEGIN
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COALESCE(SUM(records_processed), 0),
    COUNT(*) FILTER (WHERE status = 'failed' AND attempts >= max_attempts)
  INTO v_total, v_completed, v_records, v_failed
  FROM public.sync_jobs
  WHERE session_id = p_session_id;

  UPDATE public.sync_sessions SET
    total_chunks = v_total,
    completed_chunks = v_completed,
    total_records = v_records,
    status = CASE 
      WHEN v_completed = v_total AND v_total > 0 THEN 'completed'
      WHEN v_failed > 0 AND v_completed + v_failed = v_total THEN 'failed'
      ELSE 'running'
    END,
    completed_at = CASE 
      WHEN v_completed = v_total AND v_total > 0 THEN NOW()
      ELSE NULL
    END
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. RLS policies

-- sync_jobs RLS
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own sync jobs" ON public.sync_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync jobs" ON public.sync_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync jobs" ON public.sync_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sync jobs" ON public.sync_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- sync_sessions RLS
ALTER TABLE public.sync_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own sync sessions" ON public.sync_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync sessions" ON public.sync_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync sessions" ON public.sync_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- webhook_events RLS (service role only)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- 8. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_jobs;
