
-- Create the updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create wise_connections table
CREATE TABLE public.wise_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  api_token TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  balance_id TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  last_synced_at TIMESTAMPTZ,
  webhook_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wise_connections ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own wise connections"
ON public.wise_connections FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own wise connections"
ON public.wise_connections FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wise connections"
ON public.wise_connections FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wise connections"
ON public.wise_connections FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_wise_connections_updated_at
BEFORE UPDATE ON public.wise_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
