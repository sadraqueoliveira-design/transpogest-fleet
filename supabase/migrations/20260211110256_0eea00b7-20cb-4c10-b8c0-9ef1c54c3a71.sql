
-- Compliance rules table for EU 561/2006 driving limits
CREATE TABLE public.compliance_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_key text NOT NULL UNIQUE,
  value_minutes integer NOT NULL,
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage compliance rules"
  ON public.compliance_rules FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read compliance rules"
  ON public.compliance_rules FOR SELECT
  USING (true);

-- Insert EU 561/2006 constants
INSERT INTO public.compliance_rules (rule_key, value_minutes, description) VALUES
  ('max_continuous_driving', 270, 'Max continuous driving before mandatory break (4h30)'),
  ('continuous_driving_warning', 255, 'Warning threshold for continuous driving (4h15)'),
  ('min_break_duration', 45, 'Minimum break duration (or 15+30 split)'),
  ('max_daily_driving_standard', 540, 'Standard max daily driving (9h)'),
  ('max_daily_driving_extended', 600, 'Extended max daily driving 2x/week (10h)'),
  ('daily_driving_warning', 525, 'Warning at 8h45 daily driving'),
  ('max_weekly_driving', 3360, 'Max weekly driving (56h)'),
  ('max_biweekly_driving', 5400, 'Max biweekly driving (90h)');

-- Compliance violations log
CREATE TABLE public.compliance_violations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL,
  violation_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  details jsonb DEFAULT '{}'::jsonb,
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamp with time zone,
  acknowledged_by uuid
);

ALTER TABLE public.compliance_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager can manage violations"
  ON public.compliance_violations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Drivers can read own violations"
  ON public.compliance_violations FOR SELECT
  USING (driver_id = auth.uid());

CREATE INDEX idx_compliance_violations_driver ON public.compliance_violations(driver_id);
CREATE INDEX idx_compliance_violations_detected ON public.compliance_violations(detected_at DESC);
