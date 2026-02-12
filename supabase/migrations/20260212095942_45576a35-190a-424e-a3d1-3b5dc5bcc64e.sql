
-- Create config table for app settings
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write
CREATE POLICY "Admins can manage app_config" ON public.app_config
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Insert the settings
INSERT INTO public.app_config (key, value) VALUES
  ('supabase_url', 'https://kplvmnjezsolmtkphmtq.supabase.co'),
  ('service_role_key', '__PLACEHOLDER__')
ON CONFLICT (key) DO NOTHING;

-- Update trigger function to read from app_config table
CREATE OR REPLACE FUNCTION public.notify_driver_on_route_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _supabase_url text;
  _service_key text;
BEGIN
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.driver_id IS NOT DISTINCT FROM NEW.driver_id THEN
    RETURN NEW;
  END IF;

  SELECT value INTO _supabase_url FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO _service_key FROM public.app_config WHERE key = 'service_role_key';

  IF _supabase_url IS NULL OR _service_key IS NULL THEN
    RETURN NEW;
  END IF;

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
