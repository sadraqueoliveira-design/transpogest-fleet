
-- Storage buckets for photos
INSERT INTO storage.buckets (id, name, public) VALUES ('fuel-receipts', 'fuel-receipts', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('occurrence-photos', 'occurrence-photos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-docs', 'vehicle-docs', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('maintenance-photos', 'maintenance-photos', true);

-- Storage RLS policies
CREATE POLICY "Authenticated users can upload fuel receipts" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'fuel-receipts');
CREATE POLICY "Anyone can view fuel receipts" ON storage.objects FOR SELECT USING (bucket_id = 'fuel-receipts');
CREATE POLICY "Authenticated users can upload occurrence photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'occurrence-photos');
CREATE POLICY "Anyone can view occurrence photos" ON storage.objects FOR SELECT USING (bucket_id = 'occurrence-photos');
CREATE POLICY "Authenticated users can upload vehicle docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vehicle-docs');
CREATE POLICY "Anyone can view vehicle docs" ON storage.objects FOR SELECT USING (bucket_id = 'vehicle-docs');
CREATE POLICY "Authenticated users can upload maintenance photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'maintenance-photos');
CREATE POLICY "Anyone can view maintenance photos" ON storage.objects FOR SELECT USING (bucket_id = 'maintenance-photos');

-- Enable realtime for maintenance_records and service_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;

-- Add temperature_data column if not exists (for Trackit temp data)
-- Already exists per schema, skip
