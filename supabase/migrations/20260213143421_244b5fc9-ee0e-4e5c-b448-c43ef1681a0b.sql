
-- 1. get_account_balances: Returns latest balance per account-currency pair
CREATE OR REPLACE FUNCTION public.get_account_balances()
RETURNS TABLE(
  account text,
  currency text,
  total numeric,
  available numeric,
  reserved numeric,
  tier text,
  balance_eur numeric,
  last_updated date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH fx_rates(curr, rate) AS (
    VALUES
      ('EUR', 1.0), ('USD', 0.92), ('MAD', 0.092), ('GBP', 1.17),
      ('ILS', 0.25), ('DKK', 0.134), ('SEK', 0.088), ('HKD', 0.12),
      ('CAD', 0.67), ('AUD', 0.60), ('CHF', 1.05), ('PLN', 0.23),
      ('NZD', 0.55), ('CNY', 0.13), ('JPY', 0.0063), ('AED', 0.25)
  ),
  latest AS (
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
    ORDER BY t.account, upper(t.currency), t.date DESC, t.created_at DESC
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
$$;

-- 2. get_equity_trend: Returns daily cumulative equity in EUR
CREATE OR REPLACE FUNCTION public.get_equity_trend()
RETURNS TABLE(date date, equity numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH fx_rates(curr, rate) AS (
    VALUES
      ('EUR', 1.0), ('USD', 0.92), ('MAD', 0.092), ('GBP', 1.17),
      ('ILS', 0.25), ('DKK', 0.134), ('SEK', 0.088), ('HKD', 0.12),
      ('CAD', 0.67), ('AUD', 0.60), ('CHF', 1.05), ('PLN', 0.23),
      ('NZD', 0.55), ('CNY', 0.13), ('JPY', 0.0063), ('AED', 0.25)
  ),
  daily_flows AS (
    SELECT
      t.date,
      SUM(
        CASE WHEN t.type = 'Inflow' THEN t.amount * COALESCE(f.rate, 1.0)
             ELSE -t.amount * COALESCE(f.rate, 1.0)
        END
      ) AS day_net
    FROM transactions t
    LEFT JOIN fx_rates f ON f.curr = upper(t.currency)
    WHERE t.user_id = auth.uid()
      AND t.date IS NOT NULL
    GROUP BY t.date
    ORDER BY t.date
  )
  SELECT
    df.date,
    ROUND(SUM(df.day_net) OVER (ORDER BY df.date)) AS equity
  FROM daily_flows df;
$$;

-- 3. get_monthly_cash_flow: Returns monthly inflow/outflow/net in EUR
CREATE OR REPLACE FUNCTION public.get_monthly_cash_flow()
RETURNS TABLE(month text, inflow numeric, outflow numeric, net numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH fx_rates(curr, rate) AS (
    VALUES
      ('EUR', 1.0), ('USD', 0.92), ('MAD', 0.092), ('GBP', 1.17),
      ('ILS', 0.25), ('DKK', 0.134), ('SEK', 0.088), ('HKD', 0.12),
      ('CAD', 0.67), ('AUD', 0.60), ('CHF', 1.05), ('PLN', 0.23),
      ('NZD', 0.55), ('CNY', 0.13), ('JPY', 0.0063), ('AED', 0.25)
  )
  SELECT
    to_char(t.date, 'YYYY-MM') AS month,
    ROUND(SUM(CASE WHEN t.type = 'Inflow' THEN t.amount * COALESCE(f.rate, 1.0) ELSE 0 END)) AS inflow,
    ROUND(SUM(CASE WHEN t.type = 'Outflow' THEN t.amount * COALESCE(f.rate, 1.0) ELSE 0 END)) AS outflow,
    ROUND(SUM(
      CASE WHEN t.type = 'Inflow' THEN t.amount * COALESCE(f.rate, 1.0)
           ELSE -t.amount * COALESCE(f.rate, 1.0)
      END
    )) AS net
  FROM transactions t
  LEFT JOIN fx_rates f ON f.curr = upper(t.currency)
  WHERE t.user_id = auth.uid()
    AND t.date IS NOT NULL
  GROUP BY to_char(t.date, 'YYYY-MM')
  ORDER BY month;
$$;
