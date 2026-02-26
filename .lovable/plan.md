

# Adicionar "Última Inserção" aos Cards do Dashboard

## Objetivo
Mostrar a hora da última inserção do cartão no tacógrafo diretamente nos cards compactos de veículos na página do Dashboard (`/admin`).

## Alterações

### Ficheiro: `src/pages/admin/Dashboard.tsx`

1. **Novo state** -- Adicionar `lastActivity` (`Record<string, string>`) para guardar o `start_time` mais recente por `driver_id`.

2. **Fetch adicional** -- Na função `fetchVehicles`, adicionar query a `driver_activities` (ordenado por `start_time` desc) e construir o mapa `driver_id -> timestamp`.

3. **Nova linha no card** -- Após o RPM e antes da temperatura, adicionar uma linha:
   - `🪪 Cartão` com a hora formatada (`dd/MM HH:mm`) usando `date-fns` com locale `pt`
   - Mostrar apenas quando o veículo tem `current_driver_id` e existe registo em `lastActivity`

## Detalhes Técnicos

- Query: `supabase.from("driver_activities").select("driver_id, start_time").order("start_time", { ascending: false })`
- Construir `Map` pegando apenas o primeiro registo por `driver_id`
- Formato: `dd/MM HH:mm` (ex: "24/02 04:50")
- Import adicional: `format` de `date-fns` e `pt` de `date-fns/locale/pt`
