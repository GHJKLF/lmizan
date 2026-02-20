
-- Drop the function first (return type changed)
DROP FUNCTION IF EXISTS public.get_airwallex_connection_with_key(uuid);

-- Recreate with new return type (no currency)
CREATE FUNCTION public.get_airwallex_connection_with_key(p_connection_id uuid)
RETURNS TABLE(id uuid, user_id uuid, account_name text, client_id text, api_key text,
              sync_start_date date, last_synced_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.user_id, c.account_name, c.client_id, c.api_key,
         c.sync_start_date, c.last_synced_at
  FROM public.airwallex_connections c
  WHERE c.id = p_connection_id;
$$;
