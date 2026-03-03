

# Correção: Sessões de cartão fantasma em dezenas de veículos

## Problema

Os logs mostram **~60 veículos com CARD-RECHECK** com sessões de 94-146 horas (4-6 dias). Estes cartões foram quase certamente retirados, mas o sistema não os deteta porque:

1. **CARD-STALE-REST** só atua quando `ds1=0` — muitos veículos reportam `ds1 != 0` mesmo parados (ex: ds1=1 "disponível")
2. **CARD-RECHECK** tem prioridade 4 (a mais baixa) e o cap é de apenas **10 lookups** — com 60+ rechecks, a maioria é **descartada**
3. Os descartados mantêm o `card_inserted_at` antigo → o ciclo repete-se infinitamente

## Solução em duas frentes

### 1. Reduzir o threshold de auto-clear de 7 dias para 48 horas

Nenhum motorista mantém legitimamente um cartão inserido por 48 horas contínuas (o regulamento EU 561 obriga a pausas). Sessões com >48h são quase certamente dados stale da Trackit.

**Alteração em `sync-trackit-data/index.ts` (linha ~597):**
- Mover o `SEVEN_DAYS` auto-clear para **48 horas** (`FORTY_EIGHT_HOURS`)
- Quando `sessionAge >= 48h`, forçar remoção diretamente sem depender da API de eventos
- Registar como `[CARD-STALE-CLEAR]` com evento de remoção no `card_events`
- O recheck (20-48h) continua para sessões intermédias

### 2. Aumentar o MAX_TOTAL_LOOKUPS de 10 para 25

Para as sessões entre 20-48h que ainda fazem recheck, aumentar o número de chamadas à API por ciclo. Com batches de 5 e timeout de 60s, 25 lookups é viável.

### Fluxo resultante

```text
Sessão < 20h       → preservar timestamp (sem custo API)
Sessão 20-48h      → CARD-RECHECK via API de eventos (prioridade 4)
Sessão > 12h + ds1=0 → CARD-STALE-REST (remoção forçada) ← já existe
Sessão > 48h       → CARD-STALE-CLEAR (remoção forçada, sem API) ← NOVO
Sessão > 7 dias    → removido (já existia, agora coberto pelo 48h)
```

### Ficheiro a editar

- `supabase/functions/sync-trackit-data/index.ts`
  - Linha 588: substituir `SEVEN_DAYS` por `FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000`
  - Linha 597-601: no bloco `sessionAge >= FORTY_EIGHT_HOURS`, adicionar criação de evento de remoção em `card_events` (igual ao CARD-STALE-REST)
  - Linha 619: alterar `MAX_TOTAL_LOOKUPS` de 10 para 25

