
-- Trigger: When tachograph_cards changes, update matching employee card data
CREATE OR REPLACE FUNCTION public.sync_tachograph_to_employee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If card has a driver_name, try to sync expiry_date to matching employee
  IF NEW.driver_name IS NOT NULL AND NEW.driver_name != '' THEN
    UPDATE public.employees
    SET
      card_number = NEW.card_number,
      card_expiry_date = NEW.expiry_date,
      updated_at = now()
    WHERE lower(trim(full_name)) = lower(trim(NEW.driver_name))
      AND (card_number IS DISTINCT FROM NEW.card_number
           OR card_expiry_date IS DISTINCT FROM NEW.expiry_date);
  END IF;

  -- Also sync via profile_id if driver_id is set
  IF NEW.driver_id IS NOT NULL THEN
    UPDATE public.employees
    SET
      card_number = NEW.card_number,
      card_expiry_date = NEW.expiry_date,
      updated_at = now()
    WHERE profile_id = NEW.driver_id
      AND (card_number IS DISTINCT FROM NEW.card_number
           OR card_expiry_date IS DISTINCT FROM NEW.expiry_date);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_tacho_card_to_employee
  AFTER INSERT OR UPDATE ON public.tachograph_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tachograph_to_employee();

-- Trigger: When employee card data changes, update matching tachograph_card
CREATE OR REPLACE FUNCTION public.sync_employee_to_tachograph()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Sync by name match
  IF NEW.full_name IS NOT NULL AND NEW.card_number IS NOT NULL AND NEW.card_number != '' THEN
    UPDATE public.tachograph_cards
    SET
      expiry_date = NEW.card_expiry_date,
      updated_at = now()
    WHERE lower(trim(driver_name)) = lower(trim(NEW.full_name))
      AND expiry_date IS DISTINCT FROM NEW.card_expiry_date;
  END IF;

  -- Also sync via profile_id
  IF NEW.profile_id IS NOT NULL AND NEW.card_number IS NOT NULL AND NEW.card_number != '' THEN
    UPDATE public.tachograph_cards
    SET
      expiry_date = NEW.card_expiry_date,
      updated_at = now()
    WHERE driver_id = NEW.profile_id
      AND expiry_date IS DISTINCT FROM NEW.card_expiry_date;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_employee_to_tacho_card
  AFTER INSERT OR UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_to_tachograph();
