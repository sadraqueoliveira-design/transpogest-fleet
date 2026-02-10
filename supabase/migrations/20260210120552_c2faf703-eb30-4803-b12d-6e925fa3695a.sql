
-- Add validation fields to refueling_events
ALTER TABLE public.refueling_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.refueling_events ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.refueling_events ADD COLUMN IF NOT EXISTS matched_fuel_log_id uuid REFERENCES public.fuel_logs(id);
ALTER TABLE public.refueling_events ADD COLUMN IF NOT EXISTS suspicious boolean NOT NULL DEFAULT false;
ALTER TABLE public.refueling_events ADD COLUMN IF NOT EXISTS suspicious_reason text;

-- Add location context for smart alerts
ALTER TABLE public.refueling_events ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE public.refueling_events ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE public.refueling_events ADD COLUMN IF NOT EXISTS location_name text;
