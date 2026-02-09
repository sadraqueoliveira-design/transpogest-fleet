
-- Vehicle documents table
CREATE TABLE public.vehicle_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'other',
  file_url TEXT NOT NULL,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;

-- Admin/manager can manage documents
CREATE POLICY "Staff can manage vehicle documents"
ON public.vehicle_documents FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Drivers can read docs of their assigned vehicle
CREATE POLICY "Drivers can read assigned vehicle documents"
ON public.vehicle_documents FOR SELECT
USING (EXISTS (
  SELECT 1 FROM vehicles WHERE vehicles.id = vehicle_documents.vehicle_id AND vehicles.current_driver_id = auth.uid()
));
