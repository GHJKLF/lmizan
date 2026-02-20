
CREATE OR REPLACE FUNCTION public.get_pnl_report(p_year int DEFAULT 2024)
RETURNS TABLE(
  month text,
  gross_revenue_eur numeric,
  net_revenue_eur numeric,
  cogs_eur numeric,
  gross_profit_eur numeric,
  variable_costs_eur numeric,
  contribution_margin_eur numeric,
  opex_eur numeric,
  ebitda_eur numeric,
  transaction_count bigint,
  revenue_by_currency jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH fx_rates(curr, rate) AS (
    VALUES
      ('EUR', 1.0), ('USD', 0.92), ('HKD', 0.118), ('GBP', 1.17),
      ('MAD', 0.092), ('ILS', 0.25), ('DKK', 0.134), ('SEK', 0.088),
      ('CAD', 0.68), ('AUD', 0.60), ('CHF', 1.05)
  ),
  monthly_tx AS (
    SELECT
      to_char(t.date, 'YYYY-MM') AS month,
      t.type,
      t.amount,
      upper(t.currency) AS currency,
      t.account,
      t.notes,
      COALESCE(f.rate, 1.0) AS fx_rate
    FROM transactions t
    LEFT JOIN fx_rates f ON f.curr = upper(t.currency)
    WHERE t.user_id = auth.uid()
      AND t.date IS NOT NULL
      AND EXTRACT(YEAR FROM t.date) = p_year
      AND t.type IN ('Inflow', 'Outflow')
  ),
  monthly_agg AS (
    SELECT
      m.month,

      -- Gross Revenue: all inflows converted to EUR
      ROUND(SUM(CASE WHEN m.type = 'Inflow' THEN m.amount * m.fx_rate ELSE 0 END), 2) AS gross_revenue_eur,

      -- Net Revenue: EUR inflows / 1.21 (VAT), non-EUR as-is (export)
      ROUND(SUM(CASE
        WHEN m.type = 'Inflow' AND m.currency = 'EUR' THEN (m.amount / 1.21) * m.fx_rate
        WHEN m.type = 'Inflow' AND m.currency <> 'EUR' THEN m.amount * m.fx_rate
        ELSE 0
      END), 2) AS net_revenue_eur,

      -- COGS: fees from notes or estimated
      ROUND(SUM(CASE WHEN m.type = 'Inflow' THEN
        COALESCE(
          NULLIF((regexp_match(m.notes, 'Fee: -([0-9.]+)'))[1], '')::numeric * m.fx_rate,
          CASE
            WHEN lower(m.account) LIKE '%paypal%' THEN (m.amount * 0.0349 + 0.35) * m.fx_rate
            WHEN lower(m.account) LIKE '%stripe%' THEN (m.amount * 0.015 + 0.25) * m.fx_rate
            ELSE 0
          END
        )
        ELSE 0 END), 2) AS cogs_eur,

      -- Variable Costs: outflows from revenue accounts (PayPal/Stripe)
      ROUND(SUM(CASE
        WHEN m.type = 'Outflow' AND (lower(m.account) LIKE '%paypal%' OR lower(m.account) LIKE '%stripe%')
        THEN m.amount * m.fx_rate ELSE 0
      END), 2) AS variable_costs_eur,

      -- OpEx: outflows from cost accounts
      ROUND(SUM(CASE
        WHEN m.type = 'Outflow' AND (
          lower(m.account) LIKE '%wise%' OR lower(m.account) LIKE '%airwallex%'
          OR lower(m.account) LIKE '%cih%' OR lower(m.account) = 'alison'
          OR lower(m.account) = 'ki2powers'
        )
        THEN m.amount * m.fx_rate ELSE 0
      END), 2) AS opex_eur,

      COUNT(*) AS transaction_count,

      -- Revenue by currency (gross, before conversion)
      jsonb_object_agg(
        COALESCE(m.currency, 'OTHER'),
        rev_cur.total
      ) FILTER (WHERE rev_cur.total IS NOT NULL) AS revenue_by_currency

    FROM monthly_tx m
    LEFT JOIN LATERAL (
      SELECT SUM(m2.amount) AS total
      FROM monthly_tx m2
      WHERE m2.month = m.month AND m2.type = 'Inflow' AND m2.currency = m.currency
    ) rev_cur ON m.type = 'Inflow'
    GROUP BY m.month
  )
  SELECT
    a.month,
    a.gross_revenue_eur,
    a.net_revenue_eur,
    a.cogs_eur,
    ROUND(a.net_revenue_eur - a.cogs_eur, 2) AS gross_profit_eur,
    a.variable_costs_eur,
    ROUND(a.net_revenue_eur - a.cogs_eur - a.variable_costs_eur, 2) AS contribution_margin_eur,
    a.opex_eur,
    ROUND(a.net_revenue_eur - a.cogs_eur - a.variable_costs_eur - a.opex_eur, 2) AS ebitda_eur,
    a.transaction_count,
    COALESCE(a.revenue_by_currency, '{}'::jsonb) AS revenue_by_currency
  FROM monthly_agg a
  ORDER BY a.month;
$$;
