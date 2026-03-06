
CREATE TABLE public.vehicle_maintenance_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  category text NOT NULL,
  next_due_date date,
  next_due_km bigint,
  next_due_hours integer,
  last_service_date date,
  last_service_km bigint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id, category)
);

ALTER TABLE public.vehicle_maintenance_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage maintenance schedule" ON public.vehicle_maintenance_schedule
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'mechanic'::app_role));

CREATE POLICY "Authenticated can read maintenance schedule" ON public.vehicle_maintenance_schedule
  FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER update_vehicle_maintenance_schedule_updated_at
  BEFORE UPDATE ON public.vehicle_maintenance_schedule
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
