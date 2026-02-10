
-- Create enum for declaration reasons
CREATE TYPE public.declaration_reason AS ENUM ('sick_leave', 'vacation', 'rest', 'other_work', 'exempt_vehicle', 'other');

-- Create enum for declaration status
CREATE TYPE public.declaration_status AS ENUM ('draft', 'signed', 'archived');

-- Create activity_declarations table
CREATE TABLE public.activity_declarations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL,
  status public.declaration_status NOT NULL DEFAULT 'draft',
  gap_start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  gap_end_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reason_code public.declaration_reason,
  reason_text TEXT,
  company_name TEXT NOT NULL DEFAULT 'Transportes Florêncio & Silva, S.A.',
  manager_name TEXT,
  manager_id UUID,
  document_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_declarations ENABLE ROW LEVEL SECURITY;

-- Admin/manager can manage all declarations
CREATE POLICY "Admin/manager can manage declarations"
ON public.activity_declarations
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Drivers can read own declarations
CREATE POLICY "Drivers can read own declarations"
ON public.activity_declarations
FOR SELECT
USING (driver_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_activity_declarations_updated_at
BEFORE UPDATE ON public.activity_declarations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
