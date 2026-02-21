
CREATE OR REPLACE FUNCTION public.get_equity_trend(p_days integer DEFAULT 180)
 RETURNS TABLE(date date, equity numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
WITH fx(curr, rate) AS (
  VALUES ('EUR',1.0),('USD',0.92),('MAD',0.092),('GBP',1.17),
         ('ILS',0.25),('DKK',0.134),('SEK',0.088),('HKD',0.12),
         ('CAD',0.67),('AUD',0.60),('CHF',1.05),('PLN',0.23),
         ('NZD',0.55),('CNY',0.13),('JPY',0.0063),('AED',0.25)
),
rb_accounts AS (
  SELECT DISTINCT account FROM transactions
  WHERE user_id = auth.uid() AND running_balance IS NOT NULL AND account IS NOT NULL
),
ax_accounts AS (
  SELECT account_name AS account FROM airwallex_connections WHERE user_id = auth.uid()
),
rb_equity AS (
  SELECT COALESCE(SUM(rb.running_balance * COALESCE(f.rate,1.0)), 0) AS val
  FROM (
    SELECT DISTINCT ON (account, upper(currency)) account, currency, running_balance
    FROM transactions
    WHERE user_id = auth.uid() AND running_balance IS NOT NULL AND account IS NOT NULL
      AND account IN (SELECT account FROM transactions WHERE user_id=auth.uid() AND account IS NOT NULL GROUP BY account HAVING COUNT(*)>=5)
    ORDER BY account, upper(currency), date DESC, created_at DESC
  ) rb
  LEFT JOIN fx f ON f.curr = upper(rb.currency)
),
ax_equity AS (
  SELECT COALESCE(SUM(ab.total_amount * COALESCE(f.rate,1.0)), 0) AS val
  FROM (
    SELECT DISTINCT ON (ab.connection_id, ab.currency) ab.total_amount, ab.currency
    FROM airwallex_balances ab
    JOIN airwallex_connections ac ON ac.id = ab.connection_id
    WHERE ac.user_id = auth.uid()
    ORDER BY ab.connection_id, ab.currency, ab.synced_at DESC
  ) ab
  LEFT JOIN fx f ON f.curr = upper(ab.currency)
),
computed_equity AS (
  SELECT COALESCE(SUM(
    CASE WHEN type='Inflow' THEN amount * COALESCE(f.rate,1.0)
         WHEN type='Outflow' THEN -amount * COALESCE(f.rate,1.0)
         ELSE 0 END
  ), 0) AS val
  FROM transactions t
  LEFT JOIN fx f ON f.curr = upper(t.currency)
  WHERE t.user_id = auth.uid()
    AND t.type IN ('Inflow','Outflow')
    AND t.account NOT IN (SELECT account FROM rb_accounts)
    AND t.account NOT IN (SELECT account FROM ax_accounts)
    AND t.account IS NOT NULL
),
current_eq AS (
  SELECT (SELECT val FROM rb_equity) + (SELECT val FROM ax_equity) + (SELECT val FROM computed_equity) AS total
),
daily_flows AS (
  SELECT t.date,
    SUM(CASE WHEN t.type='Inflow' THEN t.amount * COALESCE(f.rate,1.0)
             WHEN t.type='Outflow' THEN -t.amount * COALESCE(f.rate,1.0)
             ELSE 0 END) AS net_eur
  FROM transactions t
  LEFT JOIN fx f ON f.curr = upper(t.currency)
  WHERE t.user_id = auth.uid()
    AND t.type IN ('Inflow','Outflow')
    AND t.account NOT IN (SELECT account FROM rb_accounts)
    AND t.account NOT IN (SELECT account FROM ax_accounts)
    AND t.account IS NOT NULL
    AND t.date >= CURRENT_DATE - p_days
  GROUP BY t.date
),
date_series AS (
  SELECT generate_series(CURRENT_DATE - p_days, CURRENT_DATE, '1 day'::interval)::date AS d
)
SELECT
  ds.d AS date,
  ROUND((SELECT total FROM current_eq) - COALESCE((
    SELECT SUM(df.net_eur) FROM daily_flows df WHERE df.date > ds.d
  ), 0)) AS equity
FROM date_series ds
ORDER BY ds.d;
$function$;
