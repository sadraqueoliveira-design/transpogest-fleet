

# Adicionar Filtros por Cliente e Hub na Manutenção

## Análise

- A tabela `vehicles` tem coluna `client_id` → filtro por cliente é direto
- A tabela `hubs` tem `client_id` → os hubs pertencem a clientes
- Veículos **não** têm `hub_id` direto → o filtro por hub vai filtrar pelo `client_id` do hub selecionado (ou seja, selecionar um hub filtra automaticamente pelo cliente desse hub)

## Alterações

**Ficheiro**: `src/pages/admin/Maintenance.tsx`

1. **Carregar clientes e hubs** no `fetchData`:
   - Query `clients` (id, name, code) ordenados por nome
   - Query `hubs` (id, name, code, client_id) ordenados por nome

2. **Adicionar estados de filtro**:
   - `clientFilter: string` (client_id ou "all")
   - `hubFilter: string` (hub_id ou "all") — ao selecionar hub, define automaticamente o cliente correspondente

3. **Adicionar 2 Select dropdowns** na barra de filtros (antes do ToggleGroup de categorias):
   - **Cliente**: lista todos os clientes; ao mudar, reseta hubFilter
   - **Hub**: lista hubs filtrados pelo cliente selecionado (ou todos se nenhum cliente); ao selecionar hub, auto-seleciona o cliente

4. **Filtrar veículos** no `filteredVehicles`:
   - Se `clientFilter !== "all"` → `vehicle.client_id === clientFilter`
   - Se `hubFilter !== "all"` → filtrar pelo `client_id` do hub (equivalente ao filtro de cliente)

5. **Botão "Limpar filtros"** já existente — adicionar reset de clientFilter e hubFilter

## Notas
- Os reboques (`trailers`) não têm `client_id` — serão mostrados sempre (independente do filtro de cliente), ou ocultos quando um cliente específico estiver selecionado
- O tipo `Vehicle` precisa incluir `client_id?: string | null`

