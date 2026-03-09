

# Melhorias nos Documentos de Veículos + Badges por Hub

## Alterações

### 1. Migração SQL
- Adicionar coluna `expiry_date date` à tabela `vehicle_documents`
- Adicionar RLS policy para drivers poderem eliminar documentos que eles próprios enviaram (`uploaded_by = auth.uid()`)

```sql
ALTER TABLE public.vehicle_documents ADD COLUMN expiry_date date;

CREATE POLICY "Drivers can delete own uploaded docs"
ON public.vehicle_documents FOR DELETE TO authenticated
USING (uploaded_by = auth.uid());
```

### 2. `DriverDocuments.tsx` — Eliminar + Validade + Alertas
- Adicionar `uploaded_by` e `expiry_date` ao tipo `VehicleDoc` e à query
- Adicionar campo "Data de validade" (input date) no dialog de upload
- Mostrar data de validade em cada documento com badge colorida:
  - Vermelho: expirado
  - Laranja: expira em < 30 dias
  - Verde: válido
- Botão "Eliminar" visível apenas nos documentos enviados pelo próprio motorista (`uploaded_by === user.id`)
- AlertDialog de confirmação antes de eliminar
- Função `handleDelete` que apaga o registo da BD

### 3. `Fleet.tsx` (admin) — Validade
- Adicionar campo `expiry_date` no dialog de upload de documentos do admin
- Mostrar a data de validade na listagem de documentos do veículo

### 4. `Maintenance.tsx` — Badges por hub nas tabs
- Na tab "Veículos", mostrar badge com contagem total de veículos
- Na tab "Reboques", mostrar badge com contagem total de reboques
- Se um hub está filtrado, mostrar o nome do hub e a contagem filtrada

### Ficheiros alterados
- **Migração SQL** — `expiry_date` + RLS delete
- `src/pages/driver/DriverDocuments.tsx` — eliminar docs próprios, validade, alertas visuais
- `src/pages/admin/Fleet.tsx` — campo validade no upload
- `src/pages/admin/Maintenance.tsx` — badges com contagem nas tabs

