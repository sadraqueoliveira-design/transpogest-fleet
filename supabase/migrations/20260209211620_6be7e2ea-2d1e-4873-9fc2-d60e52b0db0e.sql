
-- Add trackit_id for upsert by Trackit vehicle ID
ALTER TABLE public.vehicles
  ADD COLUMN trackit_id text UNIQUE;

CREATE INDEX idx_vehicles_trackit_id ON public.vehicles(trackit_id);
