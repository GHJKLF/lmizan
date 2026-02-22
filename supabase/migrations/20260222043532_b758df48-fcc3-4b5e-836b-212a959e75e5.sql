CREATE TABLE IF NOT EXISTS public.api_balances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id), account text NOT NULL, provider text NOT NULL, currency text NOT NULL, api_balance numeric NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, account, currency));

ALTER TABLE public.api_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own api_balances" ON public.api_balances FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own api_balances" ON public.api_balances FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own api_balances" ON public.api_balances FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own api_balances" ON public.api_balances FOR DELETE USING (auth.uid() = user_id);