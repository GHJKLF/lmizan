
-- Create the transactions table
CREATE TABLE public.transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Other',
    amount NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    account TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'Outflow',
    notes TEXT,
    running_balance NUMERIC,
    balance_available NUMERIC,
    balance_reserved NUMERIC,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own transactions
CREATE POLICY "Users can view their own transactions"
ON public.transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
ON public.transactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions"
ON public.transactions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transactions"
ON public.transactions FOR DELETE
USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_account ON public.transactions(account);
CREATE INDEX idx_transactions_date ON public.transactions(date);
