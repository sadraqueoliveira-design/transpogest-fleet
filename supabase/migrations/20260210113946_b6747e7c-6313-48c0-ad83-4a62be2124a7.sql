
-- Add additional columns to hubs table to support the spreadsheet fields
ALTER TABLE public.hubs ADD COLUMN IF NOT EXISTS arp2_code text;
ALTER TABLE public.hubs ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.hubs ADD COLUMN IF NOT EXISTS zona_vida text;
ALTER TABLE public.hubs ADD COLUMN IF NOT EXISTS distrito text;
ALTER TABLE public.hubs ADD COLUMN IF NOT EXISTS concelho text;
ALTER TABLE public.hubs ADD COLUMN IF NOT EXISTS freguesia text;
ALTER TABLE public.hubs ADD COLUMN IF NOT EXISTS codigo_postal text;
ALTER TABLE public.hubs ADD COLUMN IF NOT EXISTS localidade text;
ALTER TABLE public.hubs ADD COLUMN IF NOT EXISTS janelas_horarias text;
ALTER TABLE public.hubs ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- Index for search by arp2_code
CREATE INDEX IF NOT EXISTS idx_hubs_arp2_code ON public.hubs(arp2_code);
