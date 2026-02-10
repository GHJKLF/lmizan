
-- Fix 1: Accounts table - add user_id and proper RLS

-- Add user_id column (nullable first to allow updating existing records)
ALTER TABLE public.accounts ADD COLUMN user_id UUID;

-- Assign all existing accounts to the current user
UPDATE public.accounts SET user_id = '1fd5af99-0eec-4556-aec6-ccbe9c00bda5' WHERE user_id IS NULL;

-- Make user_id NOT NULL
ALTER TABLE public.accounts ALTER COLUMN user_id SET NOT NULL;

-- Drop overly permissive policy
DROP POLICY IF EXISTS "Allow all access to accounts" ON public.accounts;

-- Create user-scoped policies
CREATE POLICY "Users can view own accounts"
ON public.accounts FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
ON public.accounts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
ON public.accounts FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
ON public.accounts FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Deny anonymous access
CREATE POLICY "Deny anonymous access to accounts"
ON public.accounts FOR ALL TO anon
USING (false);

-- Fix 4: RPC function - add user ownership check
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
  -- Verify the calling user owns this connection
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.wise_connections wc
    WHERE wc.id = p_connection_id AND wc.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized access to connection';
  END IF;

  RETURN QUERY
  SELECT wc.id, wc.user_id, wc.account_name, wc.api_token,
         wc.profile_id, wc.balance_id, wc.currency,
         wc.last_synced_at, wc.webhook_secret
  FROM public.wise_connections wc
  WHERE wc.id = p_connection_id;
END;
$$;
