

# Diagnóstico: 23-IS-71 — API Trackit a retornar erros

## Estado actual confirmado nos logs

O 23-IS-71 **está a entrar** corretamente no fluxo `recheck_exact`. Os logs do ciclo Auchan (09:30:53) mostram:

```text
[CARD-RECHECK-BULK-START] 20 exact rechecks: 23-IS-71(MID:3054)...
[CARD-EVENTS-BULK] Failed: HTTP 500                              ← bulk falhou
[CARD-RECHECK-BULK-MISS] 23-IS-71 (MID:3054): bulk returned nothing, trying individual...
[CARD-EVENTS] API error for mid=3054: Unexpected token ,          ← individual também falhou
[CARD-RECHECK-PENDING-EXACT] 23-IS-71: no event 45 found, preserving 2026-03-03T20:19:46
```

A **API Trackit `/ws/events`** está a devolver:
- **Bulk**: HTTP 500 (0 de 20 veículos com resultados)
- **Individual**: JSON malformado ("Unexpected token ,") para **todos** os MIDs — não só o 3054

Isto é um problema **externo** (API do fornecedor instável), não do nosso código.

## Proposta de mitigação

Adicionar **retry com backoff** nas chamadas individuais `fetchCardEvents`. Quando a primeira tentativa falha com erro de JSON ou HTTP 5xx, aguardar 1-2 segundos e tentar novamente (máx. 2 retries). Isto aumenta a probabilidade de captar o evento 45 quando a API tem falhas intermitentes.

### Alterações

**Ficheiro**: `supabase/functions/sync-trackit-data/index.ts`

1. Envolver o `fetch` dentro de `fetchCardEvents` (linhas 465-477) num loop de retry (max 2 tentativas, delay 1.5s entre cada).
2. Se `eventsRes.json()` lançar erro de parsing, fazer retry em vez de retornar null imediatamente.
3. Para o bulk (`fetchCardEventsBulk`), fazer 1 retry com delay de 2s se HTTP 5xx.

### Impacto esperado

- Se a API for intermitente (falha 1 em cada 2-3 pedidos), o retry resolve.
- Se a API estiver completamente em baixo, o comportamento mantém-se igual (preserva timestamp real existente).
- Custo: ~2-3 segundos extra por ciclo quando há erros (aceitável dentro do timeout de 55s).

