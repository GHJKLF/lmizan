
CREATE OR REPLACE FUNCTION public.get_equity_trend(p_days int DEFAULT 180)
RETURNS TABLE(date date, equity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH fx(curr, rate) AS (
  VALUES ('EUR',1.0::numeric),('USD',0.92),('MAD',0.092),('GBP',1.17),
         ('ILS',0.25),('DKK',0.134),('SEK',0.088),('HKD',0.12),
         ('CAD',0.67),('AUD',0.60),('CHF',1.05),('PLN',0.23),
         ('NZD',0.55),('CNY',0.13),('JPY',0.0063),('AED',0.25)
),
current_eq AS (
  SELECT COALESCE(SUM(balance_eur), 0) AS total
  FROM get_account_balances()
),
rb_accounts AS (
  SELECT DISTINCT account
  FROM transactions
  WHERE user_id = auth.uid()
    AND running_balance IS NOT NULL
    AND account IS NOT NULL
),
ax_accounts AS (
  SELECT account_name AS account
  FROM airwallex_connections
  WHERE user_id = auth.uid()
),
daily_flows AS (
  SELECT
    t.date,
    SUM(CASE
      WHEN t.type = 'Inflow'  THEN  t.amount * COALESCE(f.rate, 1.0)
      WHEN t.type = 'Outflow' THEN -t.amount * COALESCE(f.rate, 1.0)
      ELSE 0
    END) AS net_eur
  FROM transactions t
  LEFT JOIN fx f ON f.curr = upper(t.currency)
  WHERE t.user_id = auth.uid()
    AND t.type IN ('Inflow', 'Outflow')
    AND t.date >= CURRENT_DATE - p_days
    AND t.account IS NOT NULL
    AND t.account NOT IN (SELECT account FROM rb_accounts)
    AND t.account NOT IN (SELECT account FROM ax_accounts)
  GROUP BY t.date
),
date_series AS (
  SELECT generate_series(
    CURRENT_DATE - p_days,
    CURRENT_DATE,
    '1 day'::interval
  )::date AS d
)
SELECT
  ds.d AS date,
  ROUND(
    (SELECT total FROM current_eq) -
    COALESCE(
      (SELECT SUM(df.net_eur) FROM daily_flows df WHERE df.date > ds.d),
      0
    )
  ) AS equity
FROM date_series ds
ORDER BY ds.d;
$function$;
