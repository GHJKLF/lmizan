
-- 1. BRIN index on transactions(date) for fast time-range queries on large tables
-- BRIN is much smaller than B-tree and ideal for time-series data inserted in chronological order
CREATE INDEX IF NOT EXISTS idx_transactions_date_brin ON transactions USING BRIN (date);

-- 2. Composite B-tree index for the most common dashboard query pattern: filter by user + account, order by date
CREATE INDEX IF NOT EXISTS idx_transactions_user_account_date ON transactions (user_id, account, date DESC);

-- 3. Index for provider-based lookups (used by sync deduplication)
CREATE INDEX IF NOT EXISTS idx_transactions_user_provider ON transactions (user_id, provider) WHERE provider IS NOT NULL;

-- 4. Index on transactions(user_id, date DESC) for global time-range queries across all accounts
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, date DESC);
