

# Documentos do Veículo: Upload por Motoristas + Novos Tipos

## Contexto
- Admin já consegue fazer upload de documentos na página de Frota
- Motorista só consegue ver documentos (read-only) na página DriverDocuments
- O utilizador quer que motoristas possam também fazer upload/atualizar documentos por foto ou ficheiro
- As imagens enviadas mostram tipos de documentos adicionais: Licença Comunitária, Certificado ATP, Livrete

## Alterações

### 1. Migração: RLS para motoristas inserirem documentos
Adicionar política que permita ao motorista inserir documentos no veículo que lhe está atribuído:
```sql
CREATE POLICY "Drivers can insert docs for assigned vehicle"
ON public.vehicle_documents FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM vehicles 
  WHERE vehicles.id = vehicle_documents.vehicle_id 
  AND vehicles.current_driver_id = auth.uid()
));
```

### 2. Atualizar `DriverDocuments.tsx`
- Adicionar botão "Adicionar Documento" com suporte a:
  - Upload de ficheiro (PC)
  - Captura por câmara (`accept="image/*;capture=environment"`)
- Formulário com: Nome, Tipo (dropdown com novos tipos), Ficheiro/Foto
- Novos tipos de documento: `community_license` (Licença Comunitária), `atp_certificate` (Certificado ATP), `vehicle_registration` (Livrete)
- Upload para o bucket `vehicle-docs` (já existente e público)
- Após upload, refrescar lista

### 3. Atualizar tipos de documento em ambos os ficheiros
Adicionar os novos tipos ao `docTypeLabels` tanto em `Fleet.tsx` como em `DriverDocuments.tsx`:
- `community_license` → "Licença Comunitária"
- `atp_certificate` → "Certificado ATP"  
- `vehicle_registration` → "Livrete"

### Ficheiros alterados
- **Migração SQL** — RLS para drivers inserirem docs
- `src/pages/driver/DriverDocuments.tsx` — upload por ficheiro/foto, novos tipos
- `src/pages/admin/Fleet.tsx` — novos tipos no dropdown

