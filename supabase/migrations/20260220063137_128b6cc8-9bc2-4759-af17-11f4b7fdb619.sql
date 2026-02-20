DROP FUNCTION IF EXISTS get_pnl_report(int);

CREATE OR REPLACE FUNCTION get_pnl_report(p_year int DEFAULT 2024)
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
SET statement_timeout = '30s'
AS $$
  SELECT
    to_char(date, 'YYYY-MM') AS month,
    ROUND(COALESCE(SUM(CASE
      WHEN type = 'Inflow' AND account IN ('PayPal TH','PayPal ME24','PayPal Madeco24','Stripe PP','Stripe Ecozahar')
      THEN amount * CASE currency WHEN 'EUR' THEN 1.0 WHEN 'USD' THEN 0.92 WHEN 'HKD' THEN 0.118 WHEN 'GBP' THEN 1.17 ELSE 1.0 END
    END), 0), 2) AS gross_revenue_eur,
    ROUND(COALESCE(SUM(CASE
      WHEN type = 'Inflow' AND account IN ('PayPal TH','PayPal ME24','PayPal Madeco24','Stripe PP','Stripe Ecozahar')
      THEN amount * CASE currency WHEN 'EUR' THEN 1.0/1.21 WHEN 'USD' THEN 0.92 WHEN 'HKD' THEN 0.118 WHEN 'GBP' THEN 1.17 ELSE 1.0 END
    END), 0), 2) AS net_revenue_eur,
    0::numeric AS cogs_eur,
    ROUND(COALESCE(SUM(CASE
      WHEN type = 'Inflow' AND account IN ('PayPal TH','PayPal ME24','PayPal Madeco24','Stripe PP','Stripe Ecozahar')
      THEN amount * CASE currency WHEN 'EUR' THEN 1.0/1.21 WHEN 'USD' THEN 0.92 WHEN 'HKD' THEN 0.118 WHEN 'GBP' THEN 1.17 ELSE 1.0 END
    END), 0), 2) AS gross_profit_eur,
    ROUND(COALESCE(SUM(CASE
      WHEN type = 'Outflow' AND account IN ('PayPal TH','PayPal ME24','PayPal Madeco24','Stripe PP','Stripe Ecozahar')
      THEN amount * CASE currency WHEN 'EUR' THEN 1.0 WHEN 'USD' THEN 0.92 WHEN 'HKD' THEN 0.118 WHEN 'GBP' THEN 1.17 ELSE 1.0 END
    END), 0), 2) AS variable_costs_eur,
    ROUND(COALESCE(SUM(CASE
      WHEN type = 'Inflow' AND account IN ('PayPal TH','PayPal ME24','PayPal Madeco24','Stripe PP','Stripe Ecozahar')
      THEN amount * CASE currency WHEN 'EUR' THEN 1.0/1.21 WHEN 'USD' THEN 0.92 WHEN 'HKD' THEN 0.118 WHEN 'GBP' THEN 1.17 ELSE 1.0 END
    END), 0) - COALESCE(SUM(CASE
      WHEN type = 'Outflow' AND account IN ('PayPal TH','PayPal ME24','PayPal Madeco24','Stripe PP','Stripe Ecozahar')
      THEN amount * CASE currency WHEN 'EUR' THEN 1.0 WHEN 'USD' THEN 0.92 WHEN 'HKD' THEN 0.118 WHEN 'GBP' THEN 1.17 ELSE 1.0 END
    END), 0), 2) AS contribution_margin_eur,
    ROUND(COALESCE(SUM(CASE
      WHEN type = 'Outflow' AND account IN ('Wise Grunkauf','Wise PORTEPARIS LTD','Wise ME24','Wise TalenHaten','Wise YOURANWEI LTD','Airwallex ME24','Airwallex TalenHaten','CIH Ilias','CIH Kaoutar','Alison','Ki2powers')
      THEN amount * CASE currency WHEN 'EUR' THEN 1.0 WHEN 'USD' THEN 0.92 WHEN 'HKD' THEN 0.118 WHEN 'GBP' THEN 1.17 ELSE 1.0 END
    END), 0), 2) AS opex_eur,
    ROUND(
      COALESCE(SUM(CASE
        WHEN type = 'Inflow' AND account IN ('PayPal TH','PayPal ME24','PayPal Madeco24','Stripe PP','Stripe Ecozahar')
        THEN amount * CASE currency WHEN 'EUR' THEN 1.0/1.21 WHEN 'USD' THEN 0.92 WHEN 'HKD' THEN 0.118 WHEN 'GBP' THEN 1.17 ELSE 1.0 END
      END), 0)
      - COALESCE(SUM(CASE
        WHEN type = 'Outflow' AND account IN ('PayPal TH','PayPal ME24','PayPal Madeco24','Stripe PP','Stripe Ecozahar')
        THEN amount * CASE currency WHEN 'EUR' THEN 1.0 WHEN 'USD' THEN 0.92 WHEN 'HKD' THEN 0.118 WHEN 'GBP' THEN 1.17 ELSE 1.0 END
      END), 0)
      - COALESCE(SUM(CASE
        WHEN type = 'Outflow' AND account IN ('Wise Grunkauf','Wise PORTEPARIS LTD','Wise ME24','Wise TalenHaten','Wise YOURANWEI LTD','Airwallex ME24','Airwallex TalenHaten','CIH Ilias','CIH Kaoutar','Alison','Ki2powers')
        THEN amount * CASE currency WHEN 'EUR' THEN 1.0 WHEN 'USD' THEN 0.92 WHEN 'HKD' THEN 0.118 WHEN 'GBP' THEN 1.17 ELSE 1.0 END
      END), 0)
    , 2) AS ebitda_eur,
    COUNT(CASE WHEN type = 'Inflow' AND account IN ('PayPal TH','PayPal ME24','PayPal Madeco24','Stripe PP','Stripe Ecozahar') THEN 1 END)::int AS transaction_count
  FROM transactions
  WHERE user_id = auth.uid()
    AND EXTRACT(YEAR FROM date) = p_year
    AND type IN ('Inflow', 'Outflow')
  GROUP BY to_char(date, 'YYYY-MM')
  ORDER BY 1;
$$;