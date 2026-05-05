-- Criar tabela de histórico de manutenção (maintenance_records) se não existir
CREATE TABLE IF NOT EXISTS public.maintenance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    description TEXT,
    cost DECIMAL(10,2),
    status TEXT DEFAULT 'completed',
    date_performed DATE DEFAULT CURRENT_DATE,
    km_at_service INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;

-- Política de acesso
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'maintenance_records' AND policyname = 'Allow authenticated users full access to maintenance records'
    ) THEN
        CREATE POLICY "Allow authenticated users full access to maintenance records"
        ON public.maintenance_records
        FOR ALL
        USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- Trigger para updated_at (reutilizando a função handle_updated_at já criada)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_records') THEN
        CREATE TRIGGER set_updated_at_records
        BEFORE UPDATE ON public.maintenance_records
        FOR EACH ROW
        EXECUTE PROCEDURE public.handle_updated_at();
    END IF;
END $$;
