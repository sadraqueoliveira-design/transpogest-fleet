
-- Table for employee/driver HR data from RITT
CREATE TABLE public.employees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_number integer NOT NULL UNIQUE,
  full_name text NOT NULL,
  company text DEFAULT 'ARV',
  nif text,
  hire_date date,
  category_code text,
  category_description text,
  card_number text,
  card_issue_date date,
  card_start_date date,
  card_expiry_date date,
  profile_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Admin/manager can manage
CREATE POLICY "Admin/manager can manage employees"
ON public.employees FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Authenticated can read
CREATE POLICY "Authenticated can read employees"
ON public.employees FOR SELECT
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for search
CREATE INDEX idx_employees_name ON public.employees USING gin(to_tsvector('portuguese', full_name));
CREATE INDEX idx_employees_number ON public.employees(employee_number);
