

# Fix: Eliminar Loop CARD-OVERRIDE + Limpar Dados + Badge Estimado

## Diagnóstico

O problema é **muito maior** do que o BN-86-PD. Hoje existem **3.900 eventos de remoção espúrios** em **~140 viaturas**. A causa raiz é um **loop de feedback** no CARD-OVERRIDE:

1. A lógica CARD-OVERRIDE na linha 769 verifica `lastRealRemovalMap` → encontra uma remoção mais recente que a última inserção → força `newHasCard=false`
2. Isto dispara o caminho `oldHasCard && !newHasCard` (linha 783)
3. O CARD-REMOVE-SUPPRESSED (linha 787) impede novos eventos quando raw TMX diz `card_present=true`, **MAS** os eventos já gravados antes do fix envenenam o `lastRealRemovalMap`
4. No próximo ciclo (5 min), repete-se desde o passo 1

O `lastRealRemovalMap` contém remoções espúrias do passado que nunca serão "vencidas" por uma inserção (porque o sistema não consegue gravar inserções quando o CARD-OVERRIDE força `newHasCard=false`).

## Plano (3 partes)

### Parte 1: Limpar dados históricos de jitter (SQL direto)

Apagar **todas** as remoções espúrias de hoje para viaturas com ≥3 remoções sem inserção intercalada. Isto limpa o `lastRealRemovalMap` e quebra o loop.

```sql
-- Apagar remoções em rajada (hoje, viaturas com ≥3 remoções)
DELETE FROM card_events
WHERE event_type = 'removed'
  AND event_at >= '2026-03-04T00:00:00Z'
  AND event_at < '2026-03-05T00:00:00Z'
  AND plate IN (
    SELECT plate FROM card_events
    WHERE event_type = 'removed'
      AND event_at >= '2026-03-04T00:00:00Z'
      AND event_at < '2026-03-05T00:00:00Z'
    GROUP BY plate HAVING count(*) >= 3
  );
```

Também apagar backfills tardios que derivaram do jitter e recalcular `card_inserted_at` nas viaturas afetadas usando o primeiro TMX do dia.

### Parte 2: Corrigir CARD-OVERRIDE (sync-trackit-data)

O CARD-OVERRIDE na linha 769-778 precisa de uma condição extra: **não disparar quando as remoções no mapa são claramente jitter**. Critério: se há ≥2 remoções recentes (90min) para esta viatura E raw TMX diz `card_present=true`, ignorar o override.

```text
Antes (linha 771-777):
  if (newHasCard) {
    if (lastRemoval && removal > insertion) → force false
  }

Depois:
  if (newHasCard) {
    const recentRemovals = recentRemovalCountMap.get(plate) || 0;
    if (recentRemovals >= 2) {
      // Jitter pattern — TMX is reliable, trust card_present=true
      skip override
    } else if (lastRemoval && removal > insertion) {
      force newHasCard=false  // genuine single removal
    }
  }
```

Isto resolve o problema de raiz: viaturas com jitter não entram no loop de override.

### Parte 3: Badge "Estimado" no dashboard ao vivo

No `Dashboard.tsx` (linha 918-924), adicionar badge "Estimado" quando a source do `card_inserted_at` não é `event-45`. Para isto, enriquecer o `vehicles` com um campo `card_insertion_source` no `tachograph_status` durante o sync.

**Ficheiro `sync-trackit-data/index.ts`**: Ao gravar `card_inserted_at`, guardar também `card_insertion_source` no objeto `tachograph_status` enriquecido (valores: `event-45`, `tmx`, `backfill`, `preserved`).

**Ficheiro `Dashboard.tsx`**: Ler `card_insertion_source` do `tachograph_status` e mostrar badge amber "Estimado" quando não é `event-45`.

### Ficheiros a alterar

1. **`supabase/functions/sync-trackit-data/index.ts`**:
   - Linha 771-778: Adicionar condição anti-jitter ao CARD-OVERRIDE
   - Linha 1331-1358: Guardar `card_insertion_source` no tachograph_status

2. **`src/pages/admin/Dashboard.tsx`**:
   - Linha 918-924: Adicionar badge "Estimado" baseado em `card_insertion_source`

3. **Limpeza SQL** (via ferramenta de dados):
   - Apagar remoções espúrias de hoje
   - Apagar backfills derivados do jitter
   - Recalcular `card_inserted_at` para viaturas afetadas

### Resultado esperado

- Loop de feedback CARD-OVERRIDE eliminado
- ~3.900 eventos espúrios de hoje limpos
- Dashboard mostra badge "Estimado" quando a hora não vem da API de eventos
- Viaturas com cartão presente (TMX `card_present=true`) deixam de ser forçadas a `newHasCard=false` quando há padrão de jitter

