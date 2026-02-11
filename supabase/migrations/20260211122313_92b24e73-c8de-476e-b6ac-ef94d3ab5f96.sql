-- Add traffic manager to hubs
ALTER TABLE public.hubs ADD COLUMN traffic_manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.hubs ADD COLUMN traffic_manager_name text;