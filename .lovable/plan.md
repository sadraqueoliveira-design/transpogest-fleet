

# Correção: Timestamps exatos de remoção de cartão

## Problema identificado

Ao analisar o código, encontrei **dois bugs** que fazem com que as horas de remoção nos `card_events` sejam imprecisas:

### Bug 1: `fetchCardEvents` descarta o timestamp do evento 46

Quando a API devolve um evento 46 (remoção), a função retorna `{ insertionTime: null, wasRemoved: true }` (linha 485). O **timestamp exato da remoção** (`mostRecentRemoval.timestamp`) é descartado — apenas sabemos que houve remoção, mas não quando.

Depois, no processamento (linha 704), o `event_at` da remoção é calculado como:
```
insertionTime = result.eventTime || tachoTimestamp || now()
```
Como `eventTime` é `null` (veio de `insertionTime`), o sistema usa `tachoTimestamp` (hora da última telemetria) ou `now()` como hora da remoção — ambos incorretos.

### Bug 2: CARD-STALE-CLEAR e CARD-STALE-REST fazem API call desnecessário

Estas remoções forçadas são empurradas para `cardEventLookups` como `eventType: "removed"`, passando pelo `fetchCardEvents`. Mas a API só tem 24h de histórico — para sessões >48h o evento 46 real já desapareceu. O resultado: gastam um slot dos 25 lookups sem ganho.

## Solução

### 1. Retornar `removalTime` de `fetchCardEvents`

Adicionar um campo `removalTime` ao retorno da função. Quando o evento 46 é encontrado, guardar o seu timestamp.

```typescript
// Antes:
return { insertionTime: null, wasRemoved: true };

// Depois:
return { insertionTime: null, wasRemoved: true, removalTime: mostRecentRemoval.timestamp };
```

### 2. Usar `removalTime` no registo de eventos de remoção

No processamento de resultados (linha 704), para eventos de remoção:

```typescript
// Para removals, usar removalTime do event 46 quando disponível
const eventAt = result.eventType === "removed" || result.wasRemoved
  ? (result.removalTime || tachoTimestamp || new Date().toISOString())
  : (result.eventTime || tachoTimestamp || new Date().toISOString());
```

### 3. CARD-STALE-CLEAR e CARD-STALE-REST: não fazer API call

Em vez de empurrar para `cardEventLookups` (que consome um slot e faz uma chamada API inútil), registar o evento diretamente inline. O `event_at` da remoção forçada será:
- Para CARD-STALE-REST: `tachoTimestamp` (última telemetria) ou `now()` — aceitável porque a remoção real foi recente (ds1=0 indica que o veículo parou há pouco)
- Para CARD-STALE-CLEAR (>48h): `now()` — o melhor que conseguimos, pois o evento 46 real já não existe na API

### Ficheiro a editar

`supabase/functions/sync-trackit-data/index.ts`:

1. **Linha 426-514**: Alterar assinatura de retorno de `fetchCardEvents` para incluir `removalTime: string | null`
2. **Linhas 480-490**: Quando evento 46 é encontrado, retornar `removalTime: new Date(mostRecentRemoval.timestamp).toISOString()`
3. **Linhas 593-602**: CARD-STALE-REST e CARD-STALE-CLEAR — registar evento de remoção diretamente na BD em vez de empurrar para `cardEventLookups`
4. **Linhas 650-657**: Propagar `removalTime` no resultado do batch
5. **Linhas 700-714**: Usar `removalTime` para calcular `event_at` de remoções em vez de `insertionTime`

### Resultado esperado

- **Remoções normais** (CARD-REMOVE): `event_at` = hora atual ± 5 min (já correto)
- **Remoções via evento 46**: `event_at` = timestamp exato do tacógrafo
- **CARD-STALE-REST**: `event_at` = última telemetria (± minutos)
- **CARD-STALE-CLEAR**: `event_at` = hora da deteção (melhor aproximação possível)
- **Mais slots livres**: STALE-REST e STALE-CLEAR não consomem dos 25 lookups

