
-- Trigger to sync employee fields to profiles when profile_id is set
CREATE OR REPLACE FUNCTION public.sync_employee_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.profile_id IS NOT NULL THEN
    UPDATE public.profiles
    SET
      birth_date = COALESCE(NEW.birth_date, profiles.birth_date),
      hire_date = COALESCE(NEW.hire_date, profiles.hire_date),
      license_number = COALESCE(NEW.license_number, profiles.license_number),
      updated_at = now()
    WHERE id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER sync_employee_to_profile_trigger
AFTER INSERT OR UPDATE OF birth_date, hire_date, license_number, profile_id
ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.sync_employee_to_profile();

-- Also sync existing data now
UPDATE public.profiles p
SET
  birth_date = COALESCE(e.birth_date, p.birth_date),
  hire_date = COALESCE(e.hire_date, p.hire_date),
  license_number = COALESCE(e.license_number, p.license_number),
  updated_at = now()
FROM public.employees e
WHERE e.profile_id = p.id
  AND e.profile_id IS NOT NULL;
