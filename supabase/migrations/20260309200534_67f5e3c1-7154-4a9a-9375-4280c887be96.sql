CREATE POLICY "Drivers can insert docs for assigned vehicle"
ON public.vehicle_documents FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM vehicles 
  WHERE vehicles.id = vehicle_documents.vehicle_id 
  AND vehicles.current_driver_id = auth.uid()
));