
-- 1. Add user_id to transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS user_id uuid;

-- 2. Backfill all existing transactions to the admin user
UPDATE public.transactions SET user_id = '1fd5af99-0eec-4556-aec6-ccbe9c00bda5' WHERE user_id IS NULL;

-- 3. Make user_id NOT NULL going forward
ALTER TABLE public.transactions ALTER COLUMN user_id SET NOT NULL;

-- 4. Drop the dangerous permissive policy
DROP POLICY IF EXISTS "Allow all access to transactions" ON public.transactions;

-- 5. Add proper user-scoped RLS policies
CREATE POLICY "Users can view own transactions"
ON public.transactions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
ON public.transactions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
ON public.transactions FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
ON public.transactions FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Deny anonymous access to transactions"
ON public.transactions FOR ALL TO anon
USING (false);

-- 6. Make webhook_secret NOT NULL on wise_connections (backfill first)
UPDATE public.wise_connections
SET webhook_secret = encode(gen_random_bytes(32), 'hex')
WHERE webhook_secret IS NULL;

ALTER TABLE public.wise_connections ALTER COLUMN webhook_secret SET NOT NULL;
