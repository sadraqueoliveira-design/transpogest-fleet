
-- Alerts table for fuel/adblue/reefer level warnings
CREATE TABLE public.fuel_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'low_fuel', 'low_adblue', 'low_reefer_fuel'
  level_percent DOUBLE PRECISION,
  threshold_percent DOUBLE PRECISION NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_fuel_alerts_vehicle ON public.fuel_alerts(vehicle_id);
CREATE INDEX idx_fuel_alerts_unack ON public.fuel_alerts(acknowledged, created_at DESC);

-- Enable RLS
ALTER TABLE public.fuel_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager can manage fuel alerts"
  ON public.fuel_alerts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Authenticated can read fuel alerts"
  ON public.fuel_alerts FOR SELECT
  USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.fuel_alerts;
