
-- 1. Create trailers table
CREATE TABLE public.trailers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plate TEXT NOT NULL,
  internal_id TEXT, -- e.g., S|GALERA
  status TEXT NOT NULL DEFAULT 'uncoupled', -- coupled/uncoupled
  last_lat DOUBLE PRECISION,
  last_lng DOUBLE PRECISION,
  last_linked_vehicle_id UUID REFERENCES public.vehicles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.trailers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager can manage trailers"
  ON public.trailers FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Authenticated can read trailers"
  ON public.trailers FOR SELECT
  USING (true);

CREATE TRIGGER update_trailers_updated_at
  BEFORE UPDATE ON public.trailers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Create driver_activities table
CREATE TABLE public.driver_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id),
  activity_type TEXT NOT NULL, -- 'drive', 'rest', 'work', 'available'
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  source TEXT NOT NULL DEFAULT 'trackit',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager can manage driver activities"
  ON public.driver_activities FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Drivers can read own activities"
  ON public.driver_activities FOR SELECT
  USING (driver_id = auth.uid());

CREATE INDEX idx_driver_activities_driver_time ON public.driver_activities (driver_id, start_time DESC);

-- 3. Add reefer set points and legal download fields to vehicles
ALTER TABLE public.vehicles
  ADD COLUMN reefer_set_point_1 DOUBLE PRECISION,
  ADD COLUMN reefer_set_point_2 DOUBLE PRECISION,
  ADD COLUMN adblue_level_percent DOUBLE PRECISION,
  ADD COLUMN last_vehicle_unit_download_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN next_vehicle_unit_download_due DATE;

-- 4. Add legal download fields to profiles (drivers)
ALTER TABLE public.profiles
  ADD COLUMN last_card_download_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN next_card_download_due DATE;
