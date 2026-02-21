
CREATE OR REPLACE FUNCTION public.get_equity_trend(p_days integer DEFAULT 540)
 RETURNS TABLE(date date, equity numeric)
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

  date_spine AS (
    SELECT d::date AS date
    FROM generate_series(
      (CURRENT_DATE - p_days)::timestamp,
      CURRENT_DATE::timestamp,
      '1 day'::interval
    ) d
  ),

  -- Only real financial accounts (not merchant counterparties)
  real_accounts AS (
    SELECT DISTINCT account
    FROM transactions
    WHERE user_id = auth.uid()
      AND account IS NOT NULL
      AND (
        account ~* '(wise|stripe|paypal|airwallex|binance|cih|cfg|ki2|worldfirst|asset|alison|madeco|lott|banking circle|shopify|payoneer|woo)'
        OR account IN (
          SELECT account FROM transactions
          WHERE user_id = auth.uid() AND account IS NOT NULL
          GROUP BY account HAVING COUNT(*) >= 20
        )
      )
  ),

  -- Accounts that have ANY running_balance data
  rb_accounts AS (
    SELECT DISTINCT account
    FROM transactions
    WHERE user_id = auth.uid()
      AND running_balance IS NOT NULL
      AND account IN (SELECT account FROM real_accounts)
      -- Exclude Airwallex (handled via airwallex_balances table)
      AND NOT EXISTS (
        SELECT 1 FROM airwallex_connections ac
        WHERE ac.user_id = auth.uid() AND ac.account_name = transactions.account
      )
  ),

  -- Accounts with NO running_balance (computed via flows)
  computed_accounts AS (
    SELECT account FROM real_accounts
    WHERE account NOT IN (SELECT account FROM rb_accounts)
      -- Exclude Airwallex (handled separately)
      AND NOT EXISTS (
        SELECT 1 FROM airwallex_connections ac
        WHERE ac.user_id = auth.uid() AND ac.account_name = real_accounts.account
      )
  ),

  -- Strategy 1: running_balance accounts
  -- For each day, get the latest running_balance per (account, currency) on or before that day
  rb_daily AS (
    SELECT
      ds.date,
      sub.account,
      sub.currency,
      sub.running_balance AS balance
    FROM date_spine ds
    CROSS JOIN rb_accounts ra
    CROSS JOIN LATERAL (
      SELECT DISTINCT ON (t.account, upper(t.currency))
        t.account,
        upper(t.currency) AS currency,
        t.running_balance
      FROM transactions t
      WHERE t.user_id = auth.uid()
        AND t.account = ra.account
        AND t.running_balance IS NOT NULL
        AND t.date <= ds.date
      ORDER BY t.account, upper(t.currency), t.date DESC, t.created_at DESC
    ) sub
  ),

  -- Strategy 2: computed accounts (cumulative Inflow - Outflow, excluding Transfer)
  computed_daily AS (
    SELECT
      ds.date,
      t.account,
      upper(t.currency) AS currency,
      SUM(CASE WHEN t.type = 'Inflow' THEN t.amount
               WHEN t.type = 'Outflow' THEN -t.amount
               ELSE 0 END) AS balance
    FROM date_spine ds
    CROSS JOIN computed_accounts ca
    JOIN transactions t ON t.account = ca.account
      AND t.user_id = auth.uid()
      AND t.date <= ds.date
      AND t.type IN ('Inflow', 'Outflow')
      AND t.currency IS NOT NULL
    GROUP BY ds.date, t.account, upper(t.currency)
  ),

  -- Strategy 3: Airwallex from balances table (current snapshot, applied to all dates from synced_at onward)
  airwallex_bal AS (
    SELECT
      ds.date,
      ac.account_name AS account,
      upper(ab.currency) AS currency,
      ab.total_amount AS balance
    FROM airwallex_balances ab
    JOIN airwallex_connections ac ON ac.id = ab.connection_id
    CROSS JOIN date_spine ds
    WHERE ac.user_id = auth.uid()
      AND ab.total_amount != 0
      -- Only show for dates >= synced_at (we only have the current snapshot)
      AND ds.date >= (ab.synced_at::date - 30)
  ),

  -- Combine all strategies
  combined AS (
    SELECT date, account, currency, balance FROM rb_daily
    UNION ALL
    SELECT date, account, currency, balance FROM computed_daily
    UNION ALL
    SELECT date, account, currency, balance FROM airwallex_bal
  )

  SELECT
    c.date,
    ROUND(SUM(c.balance * COALESCE(f.rate, 1.0))) AS equity
  FROM combined c
  LEFT JOIN fx_rates f ON f.curr = c.currency
  GROUP BY c.date
  ORDER BY c.date;
$function$;
