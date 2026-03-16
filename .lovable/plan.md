

# Pesquisa por Marca e Modelo na Gestão de Frota

## Problema
Atualmente, a pesquisa na página de Frota filtra apenas pela matrícula (`plate`). O utilizador quer pesquisar também por marca e modelo.

## Solução

**Ficheiro:** `src/pages/admin/Fleet.tsx`

Alterar a função `filtered` (linha 99-103) para incluir `brand` e `model` na pesquisa:

```typescript
const filtered = vehicles.filter(v => {
  if (clientFilter && clientFilter !== "all" && v.client_id !== clientFilter) return false;
  if (search) {
    const s = search.toLowerCase();
    const match = v.plate.toLowerCase().includes(s)
      || (v.brand?.toLowerCase().includes(s))
      || (v.model?.toLowerCase().includes(s));
    if (!match) return false;
  }
  return true;
});
```

Atualizar também o placeholder do campo de pesquisa para indicar que aceita matrícula, marca ou modelo.

