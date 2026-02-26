CREATE TABLE public.card_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.vehicles(id),
  plate text NOT NULL,
  card_number text,
  driver_name text,
  employee_number integer,
  event_type text NOT NULL CHECK (event_type IN ('inserted', 'removed')),
  event_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_events_event_at ON public.card_events(event_at DESC);
CREATE INDEX idx_card_events_plate ON public.card_events(plate);
CREATE INDEX idx_card_events_card_number ON public.card_events(card_number);

ALTER TABLE public.card_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager can manage card events"
  ON public.card_events FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Authenticated can read card events"
  ON public.card_events FOR SELECT
  USING (true);