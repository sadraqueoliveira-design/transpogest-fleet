
-- Add signature columns to activity_declarations
ALTER TABLE public.activity_declarations
  ADD COLUMN IF NOT EXISTS driver_signature_url text,
  ADD COLUMN IF NOT EXISTS manager_signature_url text,
  ADD COLUMN IF NOT EXISTS signed_pdf_url text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_ip text;

-- Add saved signature to profiles (for managers to save their signature once)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS saved_signature_url text;

-- Create signatures storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: anyone can view signatures (they're referenced by URL in PDFs)
CREATE POLICY "Signatures are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'signatures');

-- RLS: authenticated users can upload their own signatures
CREATE POLICY "Users can upload signatures"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS: users can update their own signatures
CREATE POLICY "Users can update own signatures"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create signed-declarations bucket for final PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('signed-declarations', 'signed-declarations', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Signed declarations are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'signed-declarations');

CREATE POLICY "Authenticated users can upload signed declarations"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'signed-declarations' AND auth.role() = 'authenticated');
