

# Adicionar `hub_id` a veículos e reboques

## Contexto
As tabelas `vehicles` e `trailers` já têm `client_id` mas não `hub_id`. O utilizador quer associar veículos/reboques a hubs específicos durante a importação e na gestão CRUD.

## Alterações

### 1. Migração SQL
Adicionar coluna `hub_id` a ambas as tabelas:
```sql
ALTER TABLE public.vehicles ADD COLUMN hub_id uuid REFERENCES public.hubs(id);
ALTER TABLE public.trailers ADD COLUMN hub_id uuid REFERENCES public.hubs(id);
```

### 2. Importação (`MaintenanceImportExport.tsx`)
- Adicionar props `selectedHubId?: string` e `selectedHubName?: string`
- No `handleImport`, ao atribuir `client_id`, atribuir também `hub_id` aos veículos e reboques
- Mostrar aviso no UI quando um hub está selecionado (ex: "Veículos serão associados ao hub Armazém Alverca")

### 3. Passar `hubFilter` ao import dialog (`Maintenance.tsx`)
- Na chamada `<ScheduleImportDialog>`, passar `selectedHubId` e `selectedHubName` com base no `hubFilter` atual

### 4. CRUD de veículos e reboques
- Adicionar campo "Hub" (dropdown filtrado pelo cliente selecionado) nos dialogs de criação/edição de veículos e reboques
- Mostrar coluna "Hub" nas tabs de Veículos e Reboques

### 5. Filtro por hub na grelha de planeamento
- Atualizar o filtro de veículos para considerar `hub_id` quando `hubFilter !== "all"`
- Necessário buscar `hub_id` nas queries de `vehicles` e `trailers` no `fetchData`

### Ficheiros alterados
- **Migração SQL** — `hub_id` em `vehicles` e `trailers`
- `src/pages/admin/Maintenance.tsx` — passar hub ao import, filtrar por hub, CRUD com hub
- `src/components/admin/MaintenanceImportExport.tsx` — receber e usar `selectedHubId`

