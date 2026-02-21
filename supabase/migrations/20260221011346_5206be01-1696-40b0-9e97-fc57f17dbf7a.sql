-- Shared trigger function to clean up orphaned data when a connection is deleted
CREATE OR REPLACE FUNCTION public.delete_connection_linked_data()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.transactions
  WHERE user_id = OLD.user_id AND account = OLD.account_name;

  DELETE FROM public.account_anomalies
  WHERE user_id = OLD.user_id AND account = OLD.account_name;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_delete_wise_linked_data
  AFTER DELETE ON public.wise_connections FOR EACH ROW EXECUTE FUNCTION public.delete_connection_linked_data();

CREATE TRIGGER trg_delete_stripe_linked_data
  AFTER DELETE ON public.stripe_connections FOR EACH ROW EXECUTE FUNCTION public.delete_connection_linked_data();

CREATE TRIGGER trg_delete_paypal_linked_data
  AFTER DELETE ON public.paypal_connections FOR EACH ROW EXECUTE FUNCTION public.delete_connection_linked_data();

CREATE TRIGGER trg_delete_airwallex_linked_data
  AFTER DELETE ON public.airwallex_connections FOR EACH ROW EXECUTE FUNCTION public.delete_connection_linked_data();