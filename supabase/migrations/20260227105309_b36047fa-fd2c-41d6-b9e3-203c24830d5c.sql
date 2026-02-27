
-- Add is_active column to profiles
ALTER TABLE profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Create RPC function to link real account to employee (replacing placeholder)
CREATE OR REPLACE FUNCTION link_real_account_to_employee(p_employee_number integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _caller_id uuid := auth.uid();
  _emp record;
  _old_email text;
  _old_profile_id uuid;
BEGIN
  SELECT * INTO _emp FROM employees WHERE employee_number = p_employee_number;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'employee_not_found');
  END IF;

  IF _emp.profile_id = _caller_id THEN
    RETURN jsonb_build_object('status', 'already_linked');
  END IF;

  IF _emp.profile_id IS NOT NULL THEN
    _old_profile_id := _emp.profile_id;
    SELECT email INTO _old_email
    FROM auth.users WHERE id = _old_profile_id;

    IF _old_email IS NULL OR NOT _old_email LIKE '%@fleet.local' THEN
      RETURN jsonb_build_object('error', 'already_linked_real');
    END IF;

    UPDATE tachograph_cards SET driver_id = _caller_id
      WHERE driver_id = _old_profile_id;
    UPDATE vehicles SET current_driver_id = _caller_id
      WHERE current_driver_id = _old_profile_id;
    UPDATE driver_activities SET driver_id = _caller_id
      WHERE driver_id = _old_profile_id;

    UPDATE profiles SET is_active = false WHERE id = _old_profile_id;
  END IF;

  UPDATE employees SET profile_id = NULL WHERE profile_id = _caller_id;

  UPDATE employees SET profile_id = _caller_id WHERE id = _emp.id;

  UPDATE profiles SET
    full_name = _emp.full_name,
    birth_date = _emp.birth_date,
    hire_date = _emp.hire_date,
    license_number = COALESCE(_emp.license_number, (SELECT license_number FROM profiles WHERE id = _caller_id)),
    updated_at = now()
  WHERE id = _caller_id;

  RETURN jsonb_build_object(
    'status', 'linked',
    'employee_name', _emp.full_name,
    'replaced_placeholder', _old_profile_id IS NOT NULL
  );
END;
$$;
