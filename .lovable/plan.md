

# Fix: filtro de status não encontra veículos

## Problema encontrado
Quando se clica num card de status (ex: "Expirados / Críticos"), a grelha mostra **0 veículos** em vez dos 71 esperados.

## Causa raiz
Na linha 428, quando nenhuma categoria está selecionada:
```tsx
const visibleCategories = categoryFilter.length > 0 ? categoryFilter : CATEGORIES;
```
- `categoryFilter` contém **strings** (ex: `"Revisão KM"`)
- `CATEGORIES` contém **objetos** (ex: `{key: "Revisão KM", label: ..., icon: ...}`)

Na linha 438, `vehicleSchedules[cat]` usa o **objecto inteiro** como chave do lookup, o que retorna sempre `undefined`. Resultado: nenhum veículo passa o filtro.

## Correção em `src/pages/admin/Maintenance.tsx`

Extrair as keys de `CATEGORIES` quando usado como fallback:

```tsx
const visibleCategories = categoryFilter.length > 0 
  ? categoryFilter 
  : CATEGORIES.map(c => c.key);
```

Uma linha. Resolve o problema tanto no filtro de status (linhas 437-444) como na supressão de linhas vazias (linhas 452-454), porque ambos iteram `visibleCategories`.

