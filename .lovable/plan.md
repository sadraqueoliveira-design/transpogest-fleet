

# Multi-select de categorias no filtro

## Problema
O filtro de categorias usa um `Select` simples (single value). O utilizador quer poder selecionar **várias** categorias ao mesmo tempo.

## Solução

**Ficheiro**: `src/pages/admin/Maintenance.tsx`

1. **Mudar estado** de `string` para `string[]`:
   - `categoryFilter: string[]` inicializado com `["all"]`
   - Lógica: se contém "all" ou está vazio → mostrar todas

2. **Substituir `Select` por botões toggle** usando os componentes `ToggleGroup` + `ToggleGroupItem` (já disponíveis no projeto) com `type="multiple"`:
   - Um botão "Todas" + um botão por cada categoria
   - Ao clicar, adiciona/remove da seleção
   - Se nenhuma selecionada, volta a "Todas"

3. **Atualizar lógica de filtragem**:
   - `visibleCategories`: filtrar `CATEGORIES` por `categoryFilter` array (ou todas se vazio/all)
   - `filteredVehicles`: mostrar veículo se tem registo em **qualquer** das categorias selecionadas

4. **Atualizar "Limpar filtros"** para resetar array para `[]`

