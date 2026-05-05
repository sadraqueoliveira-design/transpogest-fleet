DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'declaration_status') THEN
        CREATE TYPE declaration_status AS ENUM ('draft', 'signed', 'archived');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'declaration_reason') THEN
        CREATE TYPE declaration_reason AS ENUM ('sick_leave', 'vacation', 'rest', 'other_work', 'exempt_vehicle', 'other');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.activity_declarations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES auth.users(id),
    status declaration_status NOT NULL DEFAULT 'draft',
    gap_start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    gap_end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    reason_code declaration_reason,
    reason_text TEXT,
    company_name TEXT NOT NULL DEFAULT 'Transportes Florêncio & Silva, S.A.',
    manager_id UUID REFERENCES auth.users(id),
    manager_name TEXT,
    manager_signature_url TEXT,
    driver_signature_url TEXT,
    signed_at TIMESTAMP WITH TIME ZONE,
    signed_ip TEXT,
    signed_pdf_url TEXT,
    document_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.activity_declarations ENABLE ROW LEVEL SECURITY;

-- Permissões temporárias enquanto a coluna 'role' não existe
CREATE POLICY "Allow authenticated access for declarations"
ON public.activity_declarations
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_activity_declarations_updated_at ON public.activity_declarations;
CREATE TRIGGER update_activity_declarations_updated_at
    BEFORE UPDATE ON public.activity_declarations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
