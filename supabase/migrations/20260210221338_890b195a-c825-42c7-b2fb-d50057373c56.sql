
-- Update handle_new_user to auto-link employees to profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _full_name text;
  _matched_employee_id uuid;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- Insert profile
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, _full_name);

  -- Assign default driver role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'driver');

  -- Try to match employee by full_name (case-insensitive, trimmed)
  IF _full_name <> '' THEN
    SELECT id INTO _matched_employee_id
    FROM public.employees
    WHERE profile_id IS NULL
      AND lower(trim(full_name)) = lower(trim(_full_name))
    LIMIT 1;
  END IF;

  -- If no match by name, try by NIF using email prefix (if email looks like a NIF)
  IF _matched_employee_id IS NULL AND NEW.email IS NOT NULL THEN
    DECLARE
      _email_prefix text;
    BEGIN
      _email_prefix := split_part(NEW.email, '@', 1);
      IF _email_prefix ~ '^\d{9}$' THEN
        SELECT id INTO _matched_employee_id
        FROM public.employees
        WHERE profile_id IS NULL
          AND nif = _email_prefix
        LIMIT 1;
      END IF;
    END;
  END IF;

  -- Link employee to profile if matched
  IF _matched_employee_id IS NOT NULL THEN
    UPDATE public.employees
    SET profile_id = NEW.id
    WHERE id = _matched_employee_id;

    -- Sync employee data to profile
    UPDATE public.profiles
    SET
      birth_date = (SELECT birth_date FROM public.employees WHERE id = _matched_employee_id),
      hire_date = (SELECT hire_date FROM public.employees WHERE id = _matched_employee_id),
      license_number = (SELECT license_number FROM public.employees WHERE id = _matched_employee_id),
      updated_at = now()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;
