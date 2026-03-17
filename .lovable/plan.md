

# Mostrar só carros que correspondem ao filtro ativo

## Problema
Quando se combina filtro de status (card) com filtro de categoria, aparecem veículos onde todas as colunas visíveis mostram "—". Isto acontece porque o filtro de status verifica **todas** as categorias do veículo, mas o filtro de categoria esconde algumas colunas. Resultado: um veículo pode ter "Rev. KM expirada" mas se só "Lavagem" está visível, aparece uma linha com "—".

Mesmo sem filtro de categoria, quando um status card está ativo, o veículo pode ter uma célula correspondente mas as restantes 8 colunas mostram "—", o que cria ruído visual.

## Correção em `src/pages/admin/Maintenance.tsx`

### 1. Filtro de status respeita categorias visíveis
Na lógica de `filteredVehicles` (linhas 426-446), quando há filtro de status ativo, verificar apenas as categorias atualmente visíveis (se `categoryFilter` está ativo, usar só essas; caso contrário, todas). Isto garante que o veículo só aparece se tem pelo menos uma célula **visível** que corresponde ao status.

### 2. Esconder veículos sem nenhuma célula visível relevante
Após o filtro de status, adicionar uma passagem extra: remover veículos onde todas as colunas visíveis resultam em "—" (schedule inexistente ou `daysRemaining === null`). Isto elimina linhas vazias independentemente do filtro ativo.

### Ficheiro a alterar
- `src/pages/admin/Maintenance.tsx` — lógica do `filteredVehicles` useMemo (~linhas 426-446)

