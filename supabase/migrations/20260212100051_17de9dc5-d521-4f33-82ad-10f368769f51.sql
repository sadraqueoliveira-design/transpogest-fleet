
CREATE OR REPLACE FUNCTION public.notify_driver_on_route_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _supabase_url text;
  _anon_key text;
BEGIN
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.driver_id IS NOT DISTINCT FROM NEW.driver_id THEN
    RETURN NEW;
  END IF;

  SELECT value INTO _supabase_url FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO _anon_key FROM public.app_config WHERE key = 'service_role_key';

  IF _supabase_url IS NULL OR _anon_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/send-fcm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', _anon_key
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
