-- Criar buckets se não existirem
INSERT INTO storage.buckets (id, name, public)
VALUES ('signed-declarations', 'signed-declarations', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas para signed-declarations
CREATE POLICY "Public Access for Declarations"
ON storage.objects FOR SELECT
USING (bucket_id = 'signed-declarations');

CREATE POLICY "Authenticated Upload for Declarations"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'signed-declarations');

-- Políticas para signatures
CREATE POLICY "Public Access for Signatures"
ON storage.objects FOR SELECT
USING (bucket_id = 'signatures');

CREATE POLICY "Authenticated Upload for Signatures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'signatures');
