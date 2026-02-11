
-- Create private bucket for manager digitized signatures
INSERT INTO storage.buckets (id, name, public)
VALUES ('manager-signatures', 'manager-signatures', false)
ON CONFLICT (id) DO NOTHING;

-- Only admins/managers can upload their own signature
CREATE POLICY "Managers can upload own signature"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'manager-signatures'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);

-- Only admins/managers can view signatures (needed for PDF generation)
CREATE POLICY "Managers can view signatures"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'manager-signatures'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

-- Managers can update their own signature
CREATE POLICY "Managers can update own signature"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'manager-signatures'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

-- Managers can delete their own signature
CREATE POLICY "Managers can delete own signature"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'manager-signatures'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);
