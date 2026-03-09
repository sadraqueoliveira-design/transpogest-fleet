ALTER TABLE public.vehicle_documents ADD COLUMN expiry_date date;

CREATE POLICY "Drivers can delete own uploaded docs"
ON public.vehicle_documents FOR DELETE TO authenticated
USING (uploaded_by = auth.uid());