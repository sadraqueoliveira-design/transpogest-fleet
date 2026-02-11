
-- Create signature audit log table
CREATE TABLE public.signature_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
  declaration_id uuid NOT NULL REFERENCES public.activity_declarations(id) ON DELETE CASCADE,
  signed_by_user_id uuid NOT NULL,
  signer_role text NOT NULL CHECK (signer_role IN ('driver', 'manager')),
  signer_name text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  gps_lat double precision,
  gps_lng double precision,
  device_info text,
  ip_address text,
  signature_url text,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.signature_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins/managers can read all
CREATE POLICY "Admins can read all audit logs"
  ON public.signature_audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Drivers can read their own
CREATE POLICY "Drivers can read own audit logs"
  ON public.signature_audit_logs FOR SELECT
  TO authenticated
  USING (signed_by_user_id = auth.uid());

-- Authenticated users can insert
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.signature_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (signed_by_user_id = auth.uid());

-- Public read for verification (by verification_id only, enforced in edge function)
CREATE POLICY "Public verification read"
  ON public.signature_audit_logs FOR SELECT
  TO anon
  USING (true);

-- Index for fast verification lookups
CREATE INDEX idx_audit_verification_id ON public.signature_audit_logs(verification_id);
CREATE INDEX idx_audit_declaration_id ON public.signature_audit_logs(declaration_id);
