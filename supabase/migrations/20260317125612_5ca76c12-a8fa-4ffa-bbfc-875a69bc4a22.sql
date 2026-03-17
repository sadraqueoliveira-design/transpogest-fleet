
-- Trigger function: notify admins when a driver submits an absence-type service request
CREATE OR REPLACE FUNCTION public.notify_admins_on_absence_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _supabase_url text;
  _service_key text;
  _driver_name text;
  _type_label text;
  _admin_ids uuid[];
BEGIN
  IF NEW.type NOT IN ('Absence', 'SickLeave', 'Insurance') THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO _driver_name FROM public.profiles WHERE id = NEW.driver_id;

  CASE NEW.type::text
    WHEN 'Absence' THEN _type_label := 'Falta';
    WHEN 'SickLeave' THEN _type_label := 'Baixa Médica';
    WHEN 'Insurance' THEN _type_label := 'Seguro';
    ELSE _type_label := NEW.type::text;
  END CASE;

  SELECT value INTO _supabase_url FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO _service_key FROM public.app_config WHERE key = 'service_role_key';

  IF _supabase_url IS NULL OR _service_key IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(user_id) INTO _admin_ids
  FROM public.user_roles WHERE role = 'admin';

  IF _admin_ids IS NULL OR array_length(_admin_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/send-fcm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', _service_key
    ),
    body := jsonb_build_object(
      'user_ids', to_jsonb(_admin_ids),
      'title', '📋 Nova Justificação: ' || _type_label,
      'body', COALESCE(_driver_name, 'Motorista') || ' submeteu uma justificação de ' || lower(_type_label),
      'data', jsonb_build_object('route', '/admin/solicitacoes')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_absence ON public.service_requests;
CREATE TRIGGER trg_notify_admins_absence
  AFTER INSERT ON public.service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_on_absence_request();
