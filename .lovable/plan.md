

# Melhorar filtros da grelha de manutenção

## Problemas identificados
- Quando se aplica um filtro (card ou categoria), os veículos aparecem sem ordem de prioridade - o utilizador tem de percorrer a lista toda para encontrar os relevantes.
- A página não volta ao topo da tabela quando se muda de filtro.
- Os veículos filtrados por status ainda mostram todas as categorias, mesmo as que estão OK, o que confunde visualmente.

## Alterações em `src/pages/admin/Maintenance.tsx`

### 1. Ordenar veículos por severidade
Quando um filtro de status está ativo, ordenar `filteredVehicles` pelo pior status das suas células (expirados primeiro, depois críticos, urgentes, etc.). Quando nenhum filtro está ativo, ordenar igualmente pelo pior status para que os veículos mais problemáticos fiquem sempre no topo.

### 2. Scroll automático ao topo
Adicionar um `useRef` na tabela e um `useEffect` que, quando `activeStatusFilter`, `clientFilter`, `hubFilter`, `categoryFilter` ou `search` mudam, faz scroll suave para o topo da tabela.

### 3. Simplificar visualmente
- Quando um filtro de status está ativo, as células que não correspondem ficam completamente ocultas (mostrar "—" cinzento) em vez de apenas esmaecidas, tornando o resultado mais limpo e direto.
- Manter o botão "Limpar filtros" visível e claro.

### 4. Contagem visível
Adicionar um pequeno indicador tipo "Mostrando X de Y veículos" acima da tabela para dar feedback claro do estado dos filtros.

### Ficheiro a alterar
- `src/pages/admin/Maintenance.tsx`

