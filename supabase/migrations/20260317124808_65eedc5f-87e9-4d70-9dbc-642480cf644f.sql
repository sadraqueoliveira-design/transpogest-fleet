
-- Add new values to request_type enum
ALTER TYPE public.request_type ADD VALUE IF NOT EXISTS 'Absence';
ALTER TYPE public.request_type ADD VALUE IF NOT EXISTS 'SickLeave';
ALTER TYPE public.request_type ADD VALUE IF NOT EXISTS 'Insurance';

-- Create storage bucket for request attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('request-attachments', 'request-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Drivers can upload their own attachments
CREATE POLICY "Drivers can upload request attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'request-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: Anyone authenticated can read attachments
CREATE POLICY "Authenticated can read request attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'request-attachments');

-- RLS: Admin/manager can delete attachments
CREATE POLICY "Admin can delete request attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'request-attachments' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
