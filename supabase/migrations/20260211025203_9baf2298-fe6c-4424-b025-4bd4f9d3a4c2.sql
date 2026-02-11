
DROP POLICY IF EXISTS "Deny anonymous access to paypal_connections" ON paypal_connections;
DROP POLICY IF EXISTS "Users can manage own paypal connections" ON paypal_connections;
DROP POLICY IF EXISTS "Users can select own paypal connections" ON paypal_connections;
DROP POLICY IF EXISTS "Users can insert own paypal connections" ON paypal_connections;
DROP POLICY IF EXISTS "Users can update own paypal connections" ON paypal_connections;
DROP POLICY IF EXISTS "Users can delete own paypal connections" ON paypal_connections;

CREATE POLICY "Users can select own paypal connections"
  ON paypal_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own paypal connections"
  ON paypal_connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own paypal connections"
  ON paypal_connections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own paypal connections"
  ON paypal_connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
