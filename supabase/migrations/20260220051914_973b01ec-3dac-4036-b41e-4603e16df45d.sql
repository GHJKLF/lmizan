
CREATE OR REPLACE FUNCTION public.get_equity_trend(p_days int DEFAULT 540)
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
  -- First compute the starting equity (all transactions BEFORE the window)
  starting_equity AS (
    SELECT COALESCE(SUM(
      CASE WHEN t.type = 'Inflow' THEN t.amount * COALESCE(f.rate, 1.0)
           WHEN t.type = 'Outflow' THEN -t.amount * COALESCE(f.rate, 1.0)
           ELSE 0
      END
    ), 0) AS base
    FROM transactions t
    LEFT JOIN fx_rates f ON f.curr = upper(t.currency)
    WHERE t.user_id = auth.uid()
      AND t.date IS NOT NULL
      AND t.type IN ('Inflow', 'Outflow')
      AND t.date < (CURRENT_DATE - p_days)
  ),
  daily_flows AS (
    SELECT
      t.date,
      SUM(
        CASE WHEN t.type = 'Inflow' THEN t.amount * COALESCE(f.rate, 1.0)
             WHEN t.type = 'Outflow' THEN -t.amount * COALESCE(f.rate, 1.0)
             ELSE 0
        END
      ) AS day_net
    FROM transactions t
    LEFT JOIN fx_rates f ON f.curr = upper(t.currency)
    WHERE t.user_id = auth.uid()
      AND t.date IS NOT NULL
      AND t.type IN ('Inflow', 'Outflow')
      AND t.date >= (CURRENT_DATE - p_days)
    GROUP BY t.date
    ORDER BY t.date
  )
  SELECT
    df.date,
    ROUND((SELECT base FROM starting_equity) + SUM(df.day_net) OVER (ORDER BY df.date)) AS equity
  FROM daily_flows df;
$function$;
