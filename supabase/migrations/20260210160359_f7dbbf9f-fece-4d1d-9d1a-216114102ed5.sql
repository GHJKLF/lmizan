
-- 1. Drop existing overly-permissive RLS policies on wise_connections
DROP POLICY IF EXISTS "Users can view their own wise connections" ON public.wise_connections;
DROP POLICY IF EXISTS "Users can create their own wise connections" ON public.wise_connections;
DROP POLICY IF EXISTS "Users can update their own wise connections" ON public.wise_connections;
DROP POLICY IF EXISTS "Users can delete their own wise connections" ON public.wise_connections;

-- 2. Create tightened RLS policies scoped to authenticated role only
CREATE POLICY "Authenticated users can view own connections"
ON public.wise_connections FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert own connections"
ON public.wise_connections FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update own connections"
ON public.wise_connections FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete own connections"
ON public.wise_connections FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 3. Explicitly deny anonymous access
CREATE POLICY "Deny anonymous access"
ON public.wise_connections FOR ALL
TO anon
USING (false);

-- 4. Create a safe view that excludes sensitive columns
CREATE OR REPLACE VIEW public.wise_connections_safe
WITH (security_invoker = on) AS
SELECT id, user_id, account_name, profile_id, balance_id, currency, last_synced_at, created_at, updated_at
FROM public.wise_connections;

-- 5. Create security definer function for edge functions to read secrets
CREATE OR REPLACE FUNCTION public.get_wise_connection_with_token(p_connection_id UUID)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  account_name TEXT,
  api_token TEXT,
  profile_id TEXT,
  balance_id TEXT,
  currency TEXT,
  last_synced_at TIMESTAMPTZ,
  webhook_secret TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT wc.id, wc.user_id, wc.account_name, wc.api_token, wc.profile_id, wc.balance_id, wc.currency, wc.last_synced_at, wc.webhook_secret
  FROM public.wise_connections wc
  WHERE wc.id = p_connection_id;
END;
$$;
