-- Table to store automatically detected refueling events
CREATE TABLE public.refueling_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fuel_before DOUBLE PRECISION,
  fuel_after DOUBLE PRECISION,
  estimated_liters DOUBLE PRECISION,
  source TEXT NOT NULL DEFAULT 'trackit',
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ
);

ALTER TABLE public.refueling_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager can manage refueling events"
  ON public.refueling_events FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Authenticated can read refueling events"
  ON public.refueling_events FOR SELECT
  USING (true);

-- Enable realtime for instant notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.refueling_events;