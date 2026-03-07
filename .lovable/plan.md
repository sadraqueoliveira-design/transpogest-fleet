
# Mostrar apenas a coluna da categoria selecionada

## Problema
Quando se seleciona uma categoria no dropdown, todas as 8 colunas continuam visíveis. O utilizador quer ver **apenas** a coluna da categoria filtrada.

## Solução

**Ficheiro**: `src/pages/admin/Maintenance.tsx`

Filtrar o array `CATEGORIES` usado no render do cabeçalho e das células:

1. Nas duas ocorrências de `CATEGORIES.map(c => ...)` (cabeçalho da tabela ~linha 525 e células ~linha 556), substituir por:
   ```typescript
   const visibleCategories = categoryFilter === "all" 
     ? CATEGORIES 
     : CATEGORIES.filter(c => c.key === categoryFilter);
   ```

2. Usar `visibleCategories.map(c => ...)` em vez de `CATEGORIES.map(c => ...)` nos dois locais do render da tabela.

Isto faz com que, ao selecionar "Lavagem", só apareça a coluna Lavagem. Ao selecionar "Todas as categorias", voltam as 8 colunas.
