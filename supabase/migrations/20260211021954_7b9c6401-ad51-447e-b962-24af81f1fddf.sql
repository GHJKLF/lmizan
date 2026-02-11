
-- Fix paypal_connections_safe view to use security invoker (default, respects caller's RLS)
ALTER VIEW public.paypal_connections_safe SET (security_invoker = on);
-- Fix wise_connections_safe view too
ALTER VIEW public.wise_connections_safe SET (security_invoker = on);
