

# Filtros por Móvel, Reboques (L-) e Funcionários na Lavagem

## O que o utilizador quer

1. **Pesquisa por número de MOVEL** — cada matrícula tem um "móvel" associado (campo `mobile_number` na tabela `vehicles`). Permitir pesquisar por esse número.
2. **Incluir reboques (matrículas L-)** — as matrículas que começam com "L-" são galeras/reboques que estão na tabela `trailers`, não em `vehicles`. Devem aparecer na grelha de manutenção.
3. **Mostrar nº de funcionário na Lavagem** — o ficheiro Excel tem uma linha "Motorista" com números de funcionário por veículo. Estes devem ser importados para o campo `performed_by_employee` e ficar visíveis na célula de Lavagem.

## Alterações

### 1. Fetch `mobile_number` dos veículos + reboques
**Ficheiro**: `src/pages/admin/Maintenance.tsx`

- Atualizar tipo `Vehicle` para incluir `mobile_number: string | null` e um flag `is_trailer: boolean`
- No `fetchData`, buscar `mobile_number` dos veículos e também buscar da tabela `trailers` (plate, id), mapeando-os para o mesmo array com `is_trailer: true`
- Adicionar os reboques ao `vehicleMap` para a importação funcionar

### 2. Pesquisa por matrícula OU móvel
- No `filteredVehicles`, expandir `matchesSearch` para procurar também no `mobile_number`
- Atualizar o placeholder do input para "Pesquisar matrícula ou móvel..."

### 3. Coluna Móvel na tabela
- Adicionar uma coluna "Móvel" entre "Matrícula" e as categorias, mostrando `mobile_number`

### 4. Importação — preencher `performed_by_employee` da linha "Motorista"
**Ficheiro**: `src/components/admin/MaintenanceImportExport.tsx`

- Na `parseTransposedFile`, detetar a linha "Motorista" (normalizada) e extrair os números de funcionário por coluna
- Ao gerar os registos de Lavagem, preencher `performed_by_employee` com o valor correspondente dessa linha

### 5. Reboques na tabela `vehicle_maintenance_schedule`
- Os reboques usam o mesmo campo `vehicle_id` — ao importar matrículas L-, mapear para o `id` do trailer
- No `vehicleMap`, incluir os trailers para que a correspondência funcione

### Ficheiros a alterar
| Ficheiro | Alteração |
|---|---|
| `src/pages/admin/Maintenance.tsx` | Buscar trailers + mobile_number; coluna Móvel; pesquisa por móvel |
| `src/components/admin/MaintenanceImportExport.tsx` | Parsear linha "Motorista" e preencher `performed_by_employee` na Lavagem |

