

# Correção: Filtro de Hubs na Manutenção deve incluir Armazéns

## Problema

O plano anterior propôs filtrar por `.eq("type", "hub")`, mas a página "Hubs & Armazéns" gere dois tipos: `hub` e `armazém`. Os registos mostrados (AUCHAN-02, AUCHAN-03, etc.) são armazéns que devem aparecer no filtro de manutenção.

O utilizador quer excluir **lojas** e **fornecedores**, mas manter **hubs** e **armazéns**.

## Correção

**Ficheiro**: `src/pages/admin/Maintenance.tsx`

Alterar a query de hubs de `.eq("type", "hub")` para:
```typescript
.in("type", ["hub", "armazém"])
```

Alteração de 1 linha.

