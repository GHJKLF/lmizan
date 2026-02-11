
-- Create stripe_connections table
CREATE TABLE public.stripe_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  account_name text NOT NULL DEFAULT 'Stripe',
  api_key text NOT NULL,
  stripe_account_id text,
  email text,
  currency text,
  environment text DEFAULT 'live',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stripe_connections ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can select own stripe connections"
  ON public.stripe_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stripe connections"
  ON public.stripe_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stripe connections"
  ON public.stripe_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stripe connections"
  ON public.stripe_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Deny anonymous access
CREATE POLICY "Deny anonymous access to stripe connections"
  ON public.stripe_connections FOR ALL
  USING (false);

-- Updated_at trigger
CREATE TRIGGER update_stripe_connections_updated_at
  BEFORE UPDATE ON public.stripe_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Safe view (excludes api_key)
CREATE VIEW public.stripe_connections_safe AS
  SELECT id, user_id, account_name, stripe_account_id, email, currency, environment, last_synced_at, created_at, updated_at
  FROM public.stripe_connections;

-- Security definer function for edge functions
CREATE OR REPLACE FUNCTION public.get_stripe_connection_with_key(p_connection_id uuid)
  RETURNS TABLE(id uuid, user_id uuid, account_name text, api_key text, stripe_account_id text, email text, currency text, environment text, last_synced_at timestamptz)
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT id, user_id, account_name, api_key, stripe_account_id, email, currency, environment, last_synced_at
  FROM public.stripe_connections
  WHERE id = p_connection_id;
$$;
