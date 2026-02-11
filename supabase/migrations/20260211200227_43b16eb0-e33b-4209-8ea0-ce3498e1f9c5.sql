
-- Driver groups for organizing drivers
CREATE TABLE public.driver_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager can manage driver groups"
  ON public.driver_groups FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Authenticated can read driver groups"
  ON public.driver_groups FOR SELECT
  USING (true);

-- Driver group memberships
CREATE TABLE public.driver_group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.driver_groups(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, driver_id)
);

ALTER TABLE public.driver_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager can manage group members"
  ON public.driver_group_members FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Drivers can read own memberships"
  ON public.driver_group_members FOR SELECT
  USING (driver_id = auth.uid());

-- Approval rules for auto-approval workflow
CREATE TABLE public.approval_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id UUID NOT NULL,
  driver_group_id UUID NOT NULL REFERENCES public.driver_groups(id) ON DELETE CASCADE,
  allowed_reasons TEXT[] NOT NULL DEFAULT '{}',
  active_hours_start TIME NOT NULL DEFAULT '20:00',
  active_hours_end TIME NOT NULL DEFAULT '08:00',
  digital_signature_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/manager can manage approval rules"
  ON public.approval_rules FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Authenticated can read approval rules"
  ON public.approval_rules FOR SELECT
  USING (true);

-- Auto-approval log entries
ALTER TABLE public.signature_audit_logs
  ADD COLUMN IF NOT EXISTS approval_type TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS approval_rule_id UUID REFERENCES public.approval_rules(id),
  ADD COLUMN IF NOT EXISTS liability_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS liability_text TEXT,
  ADD COLUMN IF NOT EXISTS morning_digest_sent BOOLEAN DEFAULT false;

-- Triggers for updated_at
CREATE TRIGGER update_driver_groups_updated_at
  BEFORE UPDATE ON public.driver_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_approval_rules_updated_at
  BEFORE UPDATE ON public.approval_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
