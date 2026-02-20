
-- Step 1: Add composite index for P&L query performance
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date, type, account);

-- Steps 2-3: Replace function with SECURITY DEFINER and inline auth.uid()
DROP FUNCTION IF EXISTS public.get_pnl_report(integer);

CREATE OR REPLACE FUNCTION public.get_pnl_report(p_year int DEFAULT 2024)
RETURNS TABLE (
  month text,
  gross_revenue_eur numeric,
  net_revenue_eur numeric,
  cogs_eur numeric,
  gross_profit_eur numeric,
  variable_costs_eur numeric,
  contribution_margin_eur numeric,
  opex_eur numeric,
  ebitda_eur numeric,
  transaction_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH tx_eur AS (
    SELECT
      to_char(t.date, 'YYYY-MM') AS month,
      t.type,
      t.account,
      ROUND(
        t.amount * CASE t.currency
          WHEN 'EUR' THEN 1.0
          WHEN 'USD' THEN 0.92
          WHEN 'HKD' THEN 0.118
          WHEN 'GBP' THEN 1.17
          ELSE 1.0
        END,
        2
      ) AS amount_eur,
      CASE 
        WHEN t.type = 'Inflow' AND t.currency = 'EUR' THEN
          ROUND(t.amount * 1.0 * (1 - 1/1.21), 2)
        ELSE 0
      END AS vat_eur
    FROM transactions t
    WHERE t.user_id = auth.uid()
      AND EXTRACT(YEAR FROM t.date) = p_year
      AND t.type IN ('Inflow', 'Outflow')
      AND t.account IN (
        'PayPal TH','PayPal ME24','PayPal Madeco24',
        'Stripe PP','Stripe Ecozahar',
        'Wise Grunkauf','Wise PORTEPARIS LTD','Wise ME24',
        'Wise TalenHaten','Wise YOURANWEI LTD',
        'Airwallex ME24','Airwallex TalenHaten',
        'CIH Ilias','CIH Kaoutar','Alison','Ki2powers'
      )
  ),
  revenue AS (
    SELECT month, amount_eur, vat_eur
    FROM tx_eur
    WHERE type = 'Inflow'
      AND account IN ('PayPal TH','PayPal ME24','PayPal Madeco24','Stripe PP','Stripe Ecozahar')
  ),
  var_costs AS (
    SELECT month, amount_eur
    FROM tx_eur
    WHERE type = 'Outflow'
      AND account IN ('PayPal TH','PayPal ME24','PayPal Madeco24','Stripe PP','Stripe Ecozahar')
  ),
  opex AS (
    SELECT month, amount_eur
    FROM tx_eur
    WHERE type = 'Outflow'
      AND account IN (
        'Wise Grunkauf','Wise PORTEPARIS LTD','Wise ME24',
        'Wise TalenHaten','Wise YOURANWEI LTD',
        'Airwallex ME24','Airwallex TalenHaten',
        'CIH Ilias','CIH Kaoutar','Alison','Ki2powers'
      )
  ),
  months AS (
    SELECT to_char(make_date(p_year, m, 1), 'YYYY-MM') AS month
    FROM generate_series(1, 12) AS m
  ),
  agg AS (
    SELECT
      m.month,
      COALESCE(SUM(r.amount_eur), 0) AS gross_rev,
      COALESCE(SUM(r.vat_eur), 0) AS vat,
      COALESCE(SUM(v.amount_eur), 0) AS var_cost,
      COALESCE(SUM(o.amount_eur), 0) AS opex_total,
      COUNT(r.amount_eur)::int AS tx_count
    FROM months m
    LEFT JOIN revenue r ON r.month = m.month
    LEFT JOIN var_costs v ON v.month = m.month
    LEFT JOIN opex o ON o.month = m.month
    GROUP BY m.month
    ORDER BY m.month
  )
  SELECT
    month,
    ROUND(gross_rev, 2) AS gross_revenue_eur,
    ROUND(gross_rev - vat, 2) AS net_revenue_eur,
    0::numeric AS cogs_eur,
    ROUND(gross_rev - vat, 2) AS gross_profit_eur,
    ROUND(var_cost, 2) AS variable_costs_eur,
    ROUND(gross_rev - vat - var_cost, 2) AS contribution_margin_eur,
    ROUND(opex_total, 2) AS opex_eur,
    ROUND(gross_rev - vat - var_cost - opex_total, 2) AS ebitda_eur,
    tx_count AS transaction_count
  FROM agg;
$$;
