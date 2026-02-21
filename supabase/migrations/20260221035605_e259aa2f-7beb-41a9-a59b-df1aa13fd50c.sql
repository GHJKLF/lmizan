
CREATE OR REPLACE FUNCTION public.get_equity_trend(p_days int DEFAULT 180, p_current_equity numeric DEFAULT NULL)
RETURNS TABLE(date date, equity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH
mcf AS (
  SELECT * FROM get_monthly_cash_flow()
),
date_series AS (
  SELECT generate_series(CURRENT_DATE - p_days, CURRENT_DATE, '1 day'::interval)::date AS d
),
daily_equity AS (
  SELECT
    ds.d,
    p_current_equity - COALESCE((
      SELECT SUM(m.net::numeric)
      FROM mcf m
      WHERE to_date(m.month, 'YYYY-MM') > date_trunc('month', ds.d)::date
    ), 0) AS eq
  FROM date_series ds
)
SELECT d AS date, ROUND(eq) AS equity
FROM daily_equity
ORDER BY d;
$function$;
