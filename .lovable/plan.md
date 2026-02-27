

# Reclassificar entrepostos como Hub/Base

## Problema
Os entrepostos (tipo "entreposto arp") estao a ser contados como "Em Fornecedor" no Dashboard, mas devem ser tratados como hubs/bases operacionais -- ou seja, nao devem aparecer nem como lojas nem como fornecedores.

## Alteracao

**Ficheiro**: `src/pages/admin/Dashboard.tsx`, linha 234

Remover `"entreposto arp"` da lista de tipos que classificam um veiculo como "Em Fornecedor":

```typescript
// Antes:
return ["fornecedor", "entreposto arp", "centro de distribuição"].includes(t);

// Depois:
return ["fornecedor", "centro de distribuição"].includes(t);
```

## Impacto
- Os veiculos junto a entrepostos deixam de aparecer no widget/tab "Em Fornecedor"
- Passam a nao ter classificacao especial (contam apenas como "todos", "em movimento" ou "parados")
- Sem impacto noutras paginas -- apenas o Dashboard e afetado

