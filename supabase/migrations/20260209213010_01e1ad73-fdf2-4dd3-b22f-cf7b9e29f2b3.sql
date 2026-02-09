
ALTER TABLE public.routes ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.routes ADD COLUMN hub_id uuid REFERENCES public.hubs(id) ON DELETE SET NULL;
