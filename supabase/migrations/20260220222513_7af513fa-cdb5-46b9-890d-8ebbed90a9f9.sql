
-- 1. Create airwallex_connections table
CREATE TABLE IF NOT EXISTS public.airwallex_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  account_name text NOT NULL,
  client_id text NOT NULL,
  api_key text NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  sync_start_date date,
  last_synced_at timestamptz,
  balance_available numeric,
  balance_fetched_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.airwallex_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own airwallex connections"
  ON public.airwallex_connections
  FOR ALL USING (auth.uid() = user_id);

-- 3. Safe view (no api_key or client_id exposed)
CREATE OR REPLACE VIEW public.airwallex_connections_safe AS
  SELECT id, user_id, account_name, currency, sync_start_date, last_synced_at, balance_available, balance_fetched_at, created_at
  FROM public.airwallex_connections;

-- 4. Secure RPC to get connection WITH credentials (used by Edge Functions only)
CREATE OR REPLACE FUNCTION public.get_airwallex_connection_with_key(p_connection_id uuid)
RETURNS TABLE(id uuid, user_id uuid, account_name text, client_id text, api_key text, currency text, sync_start_date date, last_synced_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id, user_id, account_name, client_id, api_key, currency, sync_start_date, last_synced_at
  FROM airwallex_connections
  WHERE id = p_connection_id;
$$;
