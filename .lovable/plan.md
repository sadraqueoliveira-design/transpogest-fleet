

# Filtro de categoria: mostrar só veículos com dados relevantes

## Problema
Quando se seleciona uma categoria (ex: "Rev. KM"), a grelha continua a mostrar veículos que têm um registo de schedule mas sem dados úteis (sem data, sem km). Resultado: muitas linhas com "—" que obrigam o utilizador a procurar os veículos que realmente importam.

## Causa
Na linha 372-374 de `Maintenance.tsx`, o filtro verifica apenas se existe um registo de schedule para a categoria (`vehicleSchedules[cat]`), sem verificar se esse registo tem dados úteis (data, km ou horas preenchidos).

## Correção em `src/pages/admin/Maintenance.tsx`

1. **Alterar o filtro de categoria em `baseFilteredVehicles`**: Em vez de `vehicleSchedules[cat]`, verificar se o schedule tem `daysRemaining != null` (ou seja, se tem dados reais calculáveis). Usar `getScheduleDaysRemaining()` para validar.

2. **Mesma lógica no filtro de status (`filteredVehicles`)**: Já usa `getScheduleDaysRemaining`, por isso está correto. Mas quando há filtro de categoria + status combinados, garantir que ambos são aplicados em conjunto.

## Resultado esperado
- Ao selecionar "Rev. KM", só aparecem veículos com data ou km definidos para essa categoria.
- Menos linhas com "—", menos scroll, encontra-se o que se procura de imediato.

