-- Create the airwallex_balances table that was missing from production
CREATE TABLE IF NOT EXISTS public.airwallex_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.airwallex_connections(id) ON DELETE CASCADE NOT NULL,
  currency text NOT NULL,
  available_amount numeric NOT NULL DEFAULT 0,
  pending_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  synced_at timestamptz DEFAULT now(),
  UNIQUE(connection_id, currency)
);

ALTER TABLE public.airwallex_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own airwallex balances"
  ON public.airwallex_balances FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.airwallex_connections c
      WHERE c.id = connection_id AND c.user_id = auth.uid()
    )
  );