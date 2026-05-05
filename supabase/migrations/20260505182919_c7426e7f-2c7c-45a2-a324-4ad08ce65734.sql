-- Criar tabela de agendamento de manutenção
CREATE TABLE IF NOT EXISTS public.vehicle_maintenance_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- 'Revisão KM', 'IPO', 'Tacógrafo', etc.
    next_due_date DATE,
    next_due_km INTEGER,
    next_due_hours DOUBLE PRECISION,
    last_service_date DATE,
    last_service_km INTEGER,
    performed_by_employee TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.vehicle_maintenance_schedule ENABLE ROW LEVEL SECURITY;

-- Criar políticas de acesso (Acesso total para usuários autenticados, ajuste conforme necessário)
CREATE POLICY "Allow authenticated users full access to maintenance schedules"
ON public.vehicle_maintenance_schedule
FOR ALL
USING (auth.role() = 'authenticated');

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.vehicle_maintenance_schedule
FOR EACH ROW
EXECUTE PROCEDURE public.handle_updated_at();

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle_id ON public.vehicle_maintenance_schedule(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_category ON public.vehicle_maintenance_schedule(category);
