

# Fix: Veículos com cartão inserido mas sem horário de inserção

## Problema

Após o fix do `origVehicle`, a sincronização funciona mas o horário de inserção do cartão desapareceu para muitos veículos. Causa: o cap de 25 lookups por ciclo está a descartar os backfills — 86 lookups foram pedidos, 61 foram descartados (a maioria `backfill_only`). A cada ciclo, estes veículos são enfileirados novamente e descartados outra vez, sem nunca resolver.

Atualmente há **14 veículos ativos** (com `tmx` de hoje) que têm `card_present: true` mas `card_inserted_at = NULL`.

## Solução

### 1. Backfill sem API — usar timestamp da telemetria diretamente

Para `backfill_only`, não é necessário chamar a API de eventos (Event 45). O timestamp `tmx` da telemetria já existe nos dados do veículo e é suficiente. Em vez de enfileirar um lookup que vai ser descartado, definir `card_inserted_at` diretamente a partir de `tmx`.

**Ficheiro**: `supabase/functions/sync-trackit-data/index.ts`

Na secção de `backfill_only` (linha 675-678), em vez de adicionar ao `cardEventLookups`, aplicar o `tmx` diretamente:

```typescript
// ANTES (linha 675-678):
} else if (newHasCard && !existing.card_inserted_at) {
  cardEventLookups.push({ idx, vehicleMid: ..., eventType: "backfill_only", ... });
}

// DEPOIS:
} else if (newHasCard && !existing.card_inserted_at) {
  // Backfill: use telemetry timestamp directly (no API call needed)
  const origV = filteredVehicles[idx];
  const tmx = origV?.data?.drs?.tmx || origV?.data?.pos?.tmx || null;
  const backfillTs = tmx ? new Date(tmx).toISOString() : new Date().toISOString();
  (rec as any).card_inserted_at = backfillTs;
  console.log(`[CARD-BACKFILL] ${rec.plate}: card_inserted_at=${backfillTs} (source=tmx)`);
}
```

Isto elimina completamente os lookups `backfill_only` da fila, libertando slots para inserções reais e rechecks.

### 2. Sem alterações ao UI

O Dashboard (linha 918-925) já mostra o horário quando `card_inserted_at` está preenchido. Não precisa de alterações.

### Impacto

- Os 14+ veículos afetados recuperam o horário no próximo ciclo de sync (5 min)
- Menos pressão no cap de lookups → rechecks também passam a correr mais vezes
- Zero chamadas API adicionais

