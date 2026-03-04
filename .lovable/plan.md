

# Fix: 23-IS-71 recheck nunca completa — rechecks descartados mantêm timestamp antigo

## Diagnóstico

Nos logs confirmei:
- `[CARD-RECHECK] 23-IS-71: same card 0000001537844002 inserted 13h ago, rechecking events` — o recheck foi **enfileirado**
- Não existe `CARD-RECHECK-HIT` nem `CARD-RECHECK-MISS` para o 23-IS-71
- Não existe sequer log `LOOKUP-CAP` para o Auchan, o que sugere que a função **faz timeout** durante as chamadas API antes de chegar a processar os rechecks do Auchan

A causa: Auchan tem 321 veículos. Muitos geram rechecks (sessão >12h). O cap é 25 por cliente, e os rechecks têm **prioridade 4** (a mais baixa). Se houver insertions/swaps/removals, os rechecks são os primeiros a ser descartados. E quando descartados (linha 704-708), o código **restaura o timestamp antigo** (`existingCardInsertedAt`), mantendo "03/03, 20:19" indefinidamente.

Mesmo que passe o cap, as 25 chamadas API em batches de 5 podem exceder o timeout da edge function.

## Solução

### 1. Rechecks descartados → usar tmx em vez do timestamp antigo

**Ficheiro**: `supabase/functions/sync-trackit-data/index.ts`, linhas 702-709

Quando um recheck é descartado pelo cap, em vez de restaurar `existingCardInsertedAt` (o timestamp stale), usar o `tmx` da telemetria. Isto não é perfeito (não é o Event 45 exato), mas é muito melhor que manter um horário de ontem.

```typescript
// ANTES (linhas 703-708):
const dropped = cardEventLookups.splice(MAX_TOTAL_LOOKUPS);
for (const lookup of dropped) {
  if (lookup.eventType === "recheck" || lookup.eventType === "backfill_only") {
    const rec = vehicleRecords[lookup.idx];
    (rec as any).card_inserted_at = lookup.existingCardInsertedAt;
  }
}

// DEPOIS:
const dropped = cardEventLookups.splice(MAX_TOTAL_LOOKUPS);
for (const lookup of dropped) {
  if (lookup.eventType === "recheck") {
    const rec = vehicleRecords[lookup.idx];
    const origV = filteredVehicles[lookup.idx];
    const tmx = origV?.data?.drs?.tmx || origV?.data?.pos?.tmx || null;
    if (tmx) {
      const tmxTs = new Date(tmx).toISOString();
      console.log(`[CARD-RECHECK-FALLBACK] ${rec.plate}: cap dropped recheck, using tmx=${tmxTs} (was ${lookup.existingCardInsertedAt})`);
      (rec as any).card_inserted_at = tmxTs;
    } else {
      (rec as any).card_inserted_at = lookup.existingCardInsertedAt;
    }
  } else if (lookup.eventType === "backfill_only") {
    const rec = vehicleRecords[lookup.idx];
    (rec as any).card_inserted_at = lookup.existingCardInsertedAt;
  }
}
```

### 2. Timeout handling — recheck com timeout também usa fallback tmx

Se a função chegar a processar o recheck mas a API Trackit não devolver Event 45 depois do `afterTimestamp` (RECHECK-MISS), o código já preserva o timestamp antigo (linha 764-765). Alterar para também usar tmx como fallback quando o timestamp é claramente stale (>12h):

```typescript
// Linha 762-766 — DEPOIS:
if (result.eventType === "recheck" && !result.eventTime) {
  const origV = filteredVehicles[result.idx];
  const tmx = origV?.data?.drs?.tmx || origV?.data?.pos?.tmx || null;
  if (tmx) {
    const tmxTs = new Date(tmx).toISOString();
    console.log(`[CARD-RECHECK-MISS] ${rec.plate}: no re-insertion found, falling back to tmx=${tmxTs} (was ${result.existingCardInsertedAt})`);
    (rec as any).card_inserted_at = tmxTs;
  } else {
    console.log(`[CARD-RECHECK-MISS] ${rec.plate}: no re-insertion found, preserving ${result.existingCardInsertedAt}`);
    (rec as any).card_inserted_at = result.existingCardInsertedAt;
  }
  continue;
}
```

### Impacto

- 23-IS-71 vai mostrar o horário de ~08:44 (tmx atual) em vez de "03/03, 20:19"
- Não é o horário exato de ~05:00 que o motorista inseriu, mas é **hoje** e não **ontem**
- Todos os outros rechecks descartados também passam a ter timestamps atualizados
- Zero chamadas API adicionais

### Sem alterações ao UI

O dashboard já mostra `card_inserted_at` corretamente. A única alteração é na edge function.

