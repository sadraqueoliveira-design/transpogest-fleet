

# Correcao: Contagem "Em Loja" no separador vs widget

## Problema encontrado

O widget (card) no topo mostra o valor correto de `stats.atStore` (ex: 3 veiculos em loja).

Porem, o separador/tab "Em Loja" mais abaixo mostra um numero errado porque o codigo que calcula o numero a mostrar no tab tem um bug:

```javascript
// Linha 761 — mapeamento incompleto:
stats[tab.key === "all" ? "total" 
    : tab.key === "moving" ? "moving" 
    : tab.key === "stopped" ? "stopped" 
    : "alerts"]  // <-- at_store e at_supplier caem aqui!
```

Quando o `tab.key` e `"at_store"` ou `"at_supplier"`, o codigo faz fallback para `stats.alerts` em vez de usar `stats.atStore` ou `stats.atSupplier`. Por isso, o numero mostrado no tab nao corresponde ao numero real de veiculos nessa categoria.

## Solucao

Corrigir o mapeamento na linha 761 do `Dashboard.tsx` para incluir todos os valores possiveis:

```javascript
{stats[
  tab.key === "all" ? "total" 
  : tab.key === "at_store" ? "atStore" 
  : tab.key === "at_supplier" ? "atSupplier" 
  : tab.key as keyof typeof stats
]}
```

## Detalhes tecnicos

- **Ficheiro**: `src/pages/admin/Dashboard.tsx`, linha 761
- **Alteracao**: Substituir o mapeamento incompleto por um que cubra todas as chaves (`all`, `moving`, `stopped`, `alerts`, `at_store`, `at_supplier`)
- **Impacto**: Apenas visual — os tabs passam a mostrar o numero correto correspondente ao filtro

