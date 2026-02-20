
-- Revert get_account_balances to exclude Transfers from computed_balances
CREATE OR REPLACE FUNCTION public.get_account_balances()
 RETURNS TABLE(account text, currency text, total numeric, available numeric, reserved numeric, tier text, balance_eur numeric, last_updated date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH fx_rates(curr, rate) AS (
    VALUES
      ('EUR', 1.0), ('USD', 0.92), ('MAD', 0.092), ('GBP', 1.17),
      ('ILS', 0.25), ('DKK', 0.134), ('SEK', 0.088), ('HKD', 0.12),
      ('CAD', 0.67), ('AUD', 0.60), ('CHF', 1.05), ('PLN', 0.23),
      ('NZD', 0.55), ('CNY', 0.13), ('JPY', 0.0063), ('AED', 0.25)
  ),
  latest_with_rb AS (
    SELECT DISTINCT ON (t.account, upper(t.currency))
      t.account,
      upper(t.currency) AS currency,
      t.running_balance,
      t.balance_available,
      t.balance_reserved,
      t.date
    FROM transactions t
    WHERE t.user_id = auth.uid()
      AND t.account IS NOT NULL
      AND t.currency IS NOT NULL
      AND t.running_balance IS NOT NULL
    ORDER BY t.account, upper(t.currency), t.date DESC, t.created_at DESC
  ),
  computed_balances AS (
    SELECT
      t.account,
      upper(t.currency) AS currency,
      SUM(CASE WHEN t.type = 'Inflow' THEN t.amount WHEN t.type = 'Outflow' THEN -t.amount ELSE 0 END) AS running_balance,
      NULL::numeric AS balance_available,
      NULL::numeric AS balance_reserved,
      MAX(t.date) AS date
    FROM transactions t
    WHERE t.user_id = auth.uid()
      AND t.account IS NOT NULL
      AND t.currency IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM transactions t2
        WHERE t2.user_id = t.user_id
          AND t2.account = t.account
          AND upper(t2.currency) = upper(t.currency)
          AND t2.running_balance IS NOT NULL
      )
    GROUP BY t.account, upper(t.currency)
  ),
  latest AS (
    SELECT * FROM latest_with_rb
    UNION ALL
    SELECT * FROM computed_balances
  )
  SELECT
    l.account,
    l.currency,
    COALESCE(l.running_balance, 0) AS total,
    CASE
      WHEN (
        lower(l.account) LIKE '%asset%' OR lower(l.account) LIKE '%home%' OR
        lower(l.account) LIKE '%car%' OR lower(l.account) LIKE '%renovation%' OR
        lower(l.account) LIKE '%inventory%' OR lower(l.account) LIKE '%stock%' OR
        lower(l.account) LIKE '%aquablade%' OR lower(l.account) LIKE '%madeco%'
      ) THEN 0
      ELSE COALESCE(l.balance_available, l.running_balance, 0)
    END AS available,
    COALESCE(l.balance_reserved, 0) AS reserved,
    CASE
      WHEN (
        lower(l.account) LIKE '%asset%' OR lower(l.account) LIKE '%home%' OR
        lower(l.account) LIKE '%car%' OR lower(l.account) LIKE '%renovation%' OR
        lower(l.account) LIKE '%inventory%' OR lower(l.account) LIKE '%stock%' OR
        lower(l.account) LIKE '%aquablade%' OR lower(l.account) LIKE '%madeco%'
      ) THEN 'ASSET'
      WHEN (
        lower(l.account) LIKE '%stripe%' OR lower(l.account) LIKE '%paypal%' OR
        lower(l.account) LIKE '%payoneer%' OR lower(l.account) LIKE '%woo%' OR
        lower(l.account) LIKE '%airwallex%' OR lower(l.account) LIKE '%worldfirst%'
      ) THEN 'PROCESSOR'
      ELSE 'LIQUID_BANK'
    END AS tier,
    ROUND(COALESCE(l.running_balance, 0) * COALESCE(f.rate, 1.0), 2) AS balance_eur,
    l.date AS last_updated
  FROM latest l
  LEFT JOIN fx_rates f ON f.curr = l.currency;
$function$;

-- Add balance columns to stripe_connections
ALTER TABLE public.stripe_connections
  ADD COLUMN IF NOT EXISTS balance_available numeric,
  ADD COLUMN IF NOT EXISTS balance_pending numeric,
  ADD COLUMN IF NOT EXISTS balance_fetched_at timestamptz;
