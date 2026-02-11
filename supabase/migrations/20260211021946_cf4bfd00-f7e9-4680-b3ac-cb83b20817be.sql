
CREATE TABLE public.paypal_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_name TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  email TEXT,
  currency TEXT,
  environment TEXT DEFAULT 'live',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.paypal_connections ENABLE ROW LEVEL SECURITY;

-- Deny anonymous access
CREATE POLICY "Deny anonymous access to paypal_connections"
  ON public.paypal_connections AS RESTRICTIVE FOR ALL
  USING (false);

-- Users can view own connections
CREATE POLICY "Users can view own paypal connections"
  ON public.paypal_connections FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert own connections
CREATE POLICY "Users can insert own paypal connections"
  ON public.paypal_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update own connections
CREATE POLICY "Users can update own paypal connections"
  ON public.paypal_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete own connections
CREATE POLICY "Users can delete own paypal connections"
  ON public.paypal_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Security definer function to get connection with secrets (for edge functions)
CREATE OR REPLACE FUNCTION public.get_paypal_connection_with_secret(p_connection_id UUID)
RETURNS TABLE(
  id UUID, user_id UUID, account_name TEXT, client_id TEXT, client_secret TEXT,
  email TEXT, currency TEXT, environment TEXT, last_synced_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, user_id, account_name, client_id, client_secret, email, currency, environment, last_synced_at
  FROM public.paypal_connections
  WHERE id = p_connection_id;
$$;

-- Safe view (no secrets exposed to client)
CREATE VIEW public.paypal_connections_safe AS
  SELECT id, user_id, account_name, email, currency, environment, last_synced_at, created_at, updated_at
  FROM public.paypal_connections;

-- Trigger for updated_at
CREATE TRIGGER update_paypal_connections_updated_at
  BEFORE UPDATE ON public.paypal_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
