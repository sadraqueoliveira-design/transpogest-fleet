

# Reboques: client_id + CRUD completo

## Problema
- A tabela `trailers` não tem coluna `client_id`, logo os reboques são excluídos dos filtros por cliente/hub
- Não existe UI para adicionar, editar ou excluir reboques
- A importação não associa reboques ao cliente selecionado

## Plano

### 1. Migração: adicionar `client_id` à tabela `trailers`
```sql
ALTER TABLE public.trailers ADD COLUMN client_id uuid REFERENCES public.clients(id);
```

### 2. Atualizar filtro de cliente para incluir reboques (`Maintenance.tsx`)
- Remover a linha que exclui reboques do filtro: `if (vehicle.is_trailer) return false;`
- Em vez disso, verificar `vehicle.client_id` igualmente para veículos e reboques
- Na `fetchData`, incluir `client_id` na query de trailers e mapeá-lo no objeto `Vehicle`

### 3. Atualizar importação para associar reboques ao cliente (`MaintenanceImportExport.tsx`)
- Remover a condição `!isTrailerPlate(row.plate)` que exclui reboques da associação de cliente
- Para reboques, fazer `update` na tabela `trailers` (em vez de `vehicles`) com o `selectedClientId`

### 4. CRUD de reboques na página de Manutenção (`Maintenance.tsx`)
Adicionar um dialog para gerir reboques com:
- **Adicionar**: formulário com matrícula, ID interno, cliente (dropdown)
- **Editar**: inline ou dialog para alterar matrícula, ID interno, cliente, status
- **Excluir**: confirmação com AlertDialog antes de apagar
- Botão "Gerir Reboques" junto aos filtros ou como separador na tab de Planeamento

### Ficheiros alterados
- **Migração SQL** -- adicionar `client_id` a `trailers`
- `src/pages/admin/Maintenance.tsx` -- filtro corrigido, CRUD de reboques
- `src/components/admin/MaintenanceImportExport.tsx` -- associar `client_id` a reboques na importação

