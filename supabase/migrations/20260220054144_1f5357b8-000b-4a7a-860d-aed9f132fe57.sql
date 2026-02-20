
-- Create anomalies table (using account text to match existing patterns)
CREATE TABLE public.account_anomalies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account text NOT NULL,
  detected_date date NOT NULL,
  expected_balance numeric NOT NULL,
  actual_balance numeric NOT NULL,
  gap_amount numeric NOT NULL,
  gap_percent numeric,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  auto_resolve_reason text,
  notes text,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account, detected_date, user_id)
);

ALTER TABLE public.account_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own anomalies" ON public.account_anomalies
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own anomalies" ON public.account_anomalies
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own anomalies" ON public.account_anomalies
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own anomalies" ON public.account_anomalies
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Deny anonymous access to anomalies" ON public.account_anomalies
  FOR ALL USING (false);

-- RPC: run_anomaly_detection
CREATE OR REPLACE FUNCTION public.run_anomaly_detection(p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_checked int := 0;
  v_found int := 0;
  v_auto int := 0;
  rec record;
BEGIN
  -- For each account the user has transactions for
  FOR rec IN
    WITH fx_rates(curr, rate) AS (
      VALUES
        ('EUR', 1.0), ('USD', 0.92), ('MAD', 0.092), ('GBP', 1.17),
        ('ILS', 0.25), ('DKK', 0.134), ('SEK', 0.088), ('HKD', 0.12),
        ('CAD', 0.67), ('AUD', 0.60), ('CHF', 1.05), ('PLN', 0.23),
        ('NZD', 0.55), ('CNY', 0.13), ('JPY', 0.0063), ('AED', 0.25)
    ),
    acct_currencies AS (
      SELECT DISTINCT account, upper(currency) AS currency
      FROM transactions
      WHERE user_id = v_uid AND account IS NOT NULL AND currency IS NOT NULL
    ),
    -- Yesterday's cumulative balance per account (Inflows - Outflows, no Transfers)
    yesterday_bal AS (
      SELECT
        t.account,
        upper(t.currency) AS currency,
        SUM(CASE WHEN t.type = 'Inflow' THEN t.amount WHEN t.type = 'Outflow' THEN -t.amount ELSE 0 END) AS balance
      FROM transactions t
      WHERE t.user_id = v_uid AND t.date <= (p_date - 1) AND t.type IN ('Inflow', 'Outflow')
      GROUP BY t.account, upper(t.currency)
    ),
    -- Today's flows per account
    today_flows AS (
      SELECT
        t.account,
        upper(t.currency) AS currency,
        SUM(CASE WHEN t.type = 'Inflow' THEN t.amount ELSE 0 END) AS inflows,
        SUM(CASE WHEN t.type = 'Outflow' THEN t.amount ELSE 0 END) AS outflows,
        SUM(CASE WHEN t.type = 'Transfer' AND t.amount < 0 THEN -t.amount ELSE 0 END) AS transfers_out,
        SUM(CASE WHEN t.type = 'Transfer' AND t.amount > 0 THEN t.amount ELSE 0 END) AS transfers_in
      FROM transactions t
      WHERE t.user_id = v_uid AND t.date = p_date
      GROUP BY t.account, upper(t.currency)
    ),
    -- Actual balance = cumulative up to today
    actual_bal AS (
      SELECT
        t.account,
        upper(t.currency) AS currency,
        SUM(CASE WHEN t.type = 'Inflow' THEN t.amount WHEN t.type = 'Outflow' THEN -t.amount ELSE 0 END) AS balance
      FROM transactions t
      WHERE t.user_id = v_uid AND t.date <= p_date AND t.type IN ('Inflow', 'Outflow')
      GROUP BY t.account, upper(t.currency)
    ),
    -- Override actual balance for Stripe accounts if balance fetched today
    stripe_override AS (
      SELECT sc.account_name AS account, upper(sc.currency) AS currency,
             (sc.balance_available + sc.balance_pending) AS balance,
             sc.balance_pending AS pending
      FROM stripe_connections sc
      WHERE sc.user_id = v_uid AND sc.balance_fetched_at::date = p_date
    ),
    gaps AS (
      SELECT
        ac.account,
        ac.currency,
        COALESCE(yb.balance, 0) AS yesterday_balance,
        COALESCE(tf.inflows, 0) AS today_inflows,
        COALESCE(tf.outflows, 0) AS today_outflows,
        COALESCE(tf.transfers_out, 0) AS transfers_out,
        COALESCE(tf.transfers_in, 0) AS transfers_in,
        COALESCE(so.balance, ab.balance, 0) AS actual_balance,
        so.pending AS stripe_pending,
        -- expected = yesterday + inflows - outflows - transfers_out + transfers_in
        (COALESCE(yb.balance, 0) + COALESCE(tf.inflows, 0) - COALESCE(tf.outflows, 0)
         - COALESCE(tf.transfers_out, 0) + COALESCE(tf.transfers_in, 0)) AS expected_balance,
        -- Convert gap to EUR for threshold comparison
        COALESCE(f.rate, 1.0) AS fx_rate,
        -- Is this a Stripe account?
        (so.balance IS NOT NULL) AS is_stripe_api,
        -- Is this a non-EUR currency?
        (ac.currency <> 'EUR') AS is_non_eur,
        -- Is it end of month?
        (p_date = (date_trunc('month', p_date) + interval '1 month - 1 day')::date) AS is_eom,
        -- Is this a banking-type account?
        (lower(ac.account) NOT LIKE '%stripe%' AND lower(ac.account) NOT LIKE '%paypal%'
         AND lower(ac.account) NOT LIKE '%payoneer%') AS is_banking
      FROM acct_currencies ac
      LEFT JOIN yesterday_bal yb ON yb.account = ac.account AND yb.currency = ac.currency
      LEFT JOIN today_flows tf ON tf.account = ac.account AND tf.currency = ac.currency
      LEFT JOIN actual_bal ab ON ab.account = ac.account AND ab.currency = ac.currency
      LEFT JOIN stripe_override so ON so.account = ac.account AND so.currency = ac.currency
      LEFT JOIN fx_rates f ON f.curr = ac.currency
    )
    SELECT
      g.account,
      g.currency,
      g.expected_balance,
      g.actual_balance,
      (g.actual_balance - g.expected_balance) AS gap,
      g.yesterday_balance,
      g.fx_rate,
      g.stripe_pending,
      g.is_stripe_api,
      g.is_non_eur,
      g.is_eom,
      g.is_banking
    FROM gaps g
  LOOP
    v_checked := v_checked + 1;

    DECLARE
      v_gap_abs numeric := ABS(rec.gap);
      v_gap_eur numeric := v_gap_abs * rec.fx_rate;
      v_yest_eur numeric := ABS(rec.yesterday_balance) * rec.fx_rate;
      v_severity text;
      v_status text := 'open';
      v_auto_reason text;
      v_gap_pct numeric;
    BEGIN
      -- Skip if no gap
      IF v_gap_abs < 0.01 THEN
        CONTINUE;
      END IF;

      -- Compute gap percentage
      v_gap_pct := CASE WHEN rec.yesterday_balance <> 0
        THEN ROUND((v_gap_abs / ABS(rec.yesterday_balance)) * 100, 2)
        ELSE NULL END;

      -- Determine severity (EUR thresholds)
      IF v_gap_eur > GREATEST(5000, v_yest_eur * 0.05) THEN
        v_severity := 'critical';
      ELSIF v_gap_eur > GREATEST(1000, v_yest_eur * 0.02) THEN
        v_severity := 'alert';
      ELSIF v_gap_eur > GREATEST(200, v_yest_eur * 0.005) THEN
        v_severity := 'warning';
      ELSE
        CONTINUE; -- Below all thresholds
      END IF;

      -- Auto-resolve rules
      -- 1. Stripe payout lag: Stripe account, gap matches a transfer
      IF rec.is_stripe_api AND lower(rec.account) LIKE '%stripe%' THEN
        v_auto_reason := 'stripe_payout_lag';
        v_status := 'expected';
      -- 2. FX rate movement: non-EUR, gap < 2%
      ELSIF rec.is_non_eur AND v_gap_pct IS NOT NULL AND v_gap_pct < 2.0 THEN
        v_auto_reason := 'fx_rate_movement';
        v_status := 'expected';
      -- 3. Stripe pending clearing: gap equals pending balance
      ELSIF rec.stripe_pending IS NOT NULL AND ABS(rec.gap - rec.stripe_pending) < 0.01 THEN
        v_auto_reason := 'stripe_pending_clearing';
        v_status := 'expected';
      -- 4. End-of-month fee batch: EOM and gap < €50
      ELSIF rec.is_eom AND v_gap_eur < 50 THEN
        v_auto_reason := 'eom_fee_batch';
        v_status := 'expected';
      -- 5. Manual bank entry timing: banking account, gap < €100
      ELSIF rec.is_banking AND v_gap_eur < 100 THEN
        v_auto_reason := 'bank_entry_timing';
        v_status := 'expected';
      END IF;
      -- Rule 6 (snapshot timing race) requires checking if gap disappeared same day — skip for batch

      v_found := v_found + 1;
      IF v_status = 'expected' THEN v_auto := v_auto + 1; END IF;

      -- Upsert
      INSERT INTO public.account_anomalies (account, detected_date, expected_balance, actual_balance, gap_amount, gap_percent, severity, status, auto_resolve_reason, user_id)
      VALUES (rec.account, p_date, rec.expected_balance, rec.actual_balance, rec.gap, v_gap_pct, v_severity, v_status, v_auto_reason, v_uid)
      ON CONFLICT (account, detected_date, user_id)
      DO UPDATE SET
        expected_balance = EXCLUDED.expected_balance,
        actual_balance = EXCLUDED.actual_balance,
        gap_amount = EXCLUDED.gap_amount,
        gap_percent = EXCLUDED.gap_percent,
        severity = EXCLUDED.severity,
        status = CASE WHEN account_anomalies.status IN ('dismissed', 'resolved') THEN account_anomalies.status ELSE EXCLUDED.status END,
        auto_resolve_reason = EXCLUDED.auto_resolve_reason;
    END;
  END LOOP;

  RETURN jsonb_build_object('checked', v_checked, 'anomalies_found', v_found, 'auto_resolved', v_auto);
END;
$$;
