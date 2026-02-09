
-- Add Trackit integration columns to clients
ALTER TABLE public.clients
  ADD COLUMN trackit_username text,
  ADD COLUMN trackit_password text,
  ADD COLUMN api_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN last_sync_at timestamp with time zone;

-- Add client_id to vehicles for per-client association
ALTER TABLE public.vehicles
  ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_vehicles_client_id ON public.vehicles(client_id);
CREATE INDEX idx_clients_api_enabled ON public.clients(api_enabled) WHERE api_enabled = true;
