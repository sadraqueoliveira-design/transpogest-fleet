
CREATE OR REPLACE FUNCTION public.sync_document_expiry_to_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _category text;
BEGIN
  IF NEW.expiry_date IS NULL THEN
    RETURN NEW;
  END IF;

  CASE NEW.doc_type
    WHEN 'inspection' THEN _category := 'IPO';
    WHEN 'insurance' THEN _category := 'Seguro';
    WHEN 'tachograph' THEN _category := 'Tacógrafo';
    WHEN 'community_license' THEN _category := 'Licença Comunitária';
    WHEN 'atp_certificate' THEN _category := 'Certificado ATP';
    ELSE _category := NULL;
  END CASE;

  IF NEW.doc_type = 'inspection' THEN
    UPDATE vehicles SET inspection_expiry = NEW.expiry_date, updated_at = now() WHERE id = NEW.vehicle_id;
  ELSIF NEW.doc_type = 'insurance' THEN
    UPDATE vehicles SET insurance_expiry = NEW.expiry_date, updated_at = now() WHERE id = NEW.vehicle_id;
  ELSIF NEW.doc_type = 'tachograph' THEN
    UPDATE vehicles SET tachograph_calibration_date = NEW.expiry_date, updated_at = now() WHERE id = NEW.vehicle_id;
  END IF;

  IF _category IS NOT NULL THEN
    UPDATE vehicle_maintenance_schedule
    SET next_due_date = NEW.expiry_date, last_service_date = CURRENT_DATE, updated_at = now()
    WHERE vehicle_id = NEW.vehicle_id AND category = _category;

    IF NOT FOUND THEN
      INSERT INTO vehicle_maintenance_schedule (vehicle_id, category, next_due_date, last_service_date, updated_at)
      VALUES (NEW.vehicle_id, _category, NEW.expiry_date, CURRENT_DATE, now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_doc_expiry ON vehicle_documents;
CREATE TRIGGER trg_sync_doc_expiry
  AFTER INSERT OR UPDATE ON vehicle_documents
  FOR EACH ROW
  EXECUTE FUNCTION sync_document_expiry_to_maintenance();
