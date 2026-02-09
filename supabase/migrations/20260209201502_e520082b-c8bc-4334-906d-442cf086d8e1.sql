
-- Tachograph cards mapping
CREATE TABLE public.tachograph_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_number TEXT NOT NULL UNIQUE,
  driver_name TEXT,
  driver_id UUID,
  expiry_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tachograph_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager can manage tachograph cards"
  ON public.tachograph_cards FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Authenticated can read tachograph cards"
  ON public.tachograph_cards FOR SELECT
  USING (true);

CREATE TRIGGER update_tachograph_cards_updated_at
  BEFORE UPDATE ON public.tachograph_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ANTRAM settings (single-row config table)
CREATE TABLE public.antram_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_minutes INTEGER NOT NULL DEFAULT 255,
  max_minutes INTEGER NOT NULL DEFAULT 270,
  notify_on_alert BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.antram_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage antram settings"
  ON public.antram_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read antram settings"
  ON public.antram_settings FOR SELECT
  USING (true);

-- Insert default row
INSERT INTO public.antram_settings (alert_minutes, max_minutes, notify_on_alert) VALUES (255, 270, true);
