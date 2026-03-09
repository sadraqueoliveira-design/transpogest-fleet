ALTER TABLE public.vehicles ADD COLUMN hub_id uuid REFERENCES public.hubs(id);
ALTER TABLE public.trailers ADD COLUMN hub_id uuid REFERENCES public.hubs(id);