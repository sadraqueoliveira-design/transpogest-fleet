
-- Trigger function: sends push via pg_net when a route is assigned to a driver
CREATE OR REPLACE FUNCTION public.notify_driver_on_route_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _driver_name text;
  _fcm_token text;
  _supabase_url text;
  _service_key text;
BEGIN
  -- Only fire when driver_id is set (INSERT with driver or UPDATE that assigns driver)
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if driver_id didn't change on UPDATE
  IF TG_OP = 'UPDATE' AND OLD.driver_id IS NOT DISTINCT FROM NEW.driver_id THEN
    RETURN NEW;
  END IF;

  -- Get driver name
  SELECT full_name INTO _driver_name
  FROM public.profiles
  WHERE id = NEW.driver_id;

  -- Get Supabase URL and service key from vault or env
  _supabase_url := current_setting('app.settings.supabase_url', true);
  _service_key := current_setting('app.settings.service_role_key', true);

  -- Call send-fcm edge function via pg_net
  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/send-fcm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.driver_id,
      'title', '🚛 Novo Serviço Atribuído',
      'body', COALESCE(NEW.start_location, '') || ' → ' || COALESCE(NEW.end_location, ''),
      'data', jsonb_build_object('route', '/driver')
    )
  );

  RETURN NEW;
END;
$$;

-- Create trigger on routes table
DROP TRIGGER IF EXISTS trg_notify_driver_route_assignment ON public.routes;
CREATE TRIGGER trg_notify_driver_route_assignment
  AFTER INSERT OR UPDATE OF driver_id ON public.routes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_driver_on_route_assignment();
