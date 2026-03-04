

# Fix: 23-IS-71 nunca entra em recheck porque sessionAge é calculado com o timestamp tmx

## Causa raiz

O `sessionAge` (linha 701-703) é calculado a partir de `existing.card_inserted_at` que já foi sobrescrito pelo fallback tmx para `2026-03-04 09:00:09` (hoje). Resultado: sessionAge ≈ 15 minutos, que é **menor que 12h**, logo o veículo cai no ramo `else` (linha 797) que simplesmente preserva o timestamp existente. Nunca chega à condição `isStaleExact`.

Apesar de termos corrigido a condição `isStaleExact` para usar `lastRealInsertionMap`, o código **nunca chega lá** porque o `sessionAge` de guarda é calculado antes, com o valor errado.

## Solução

Alterar o cálculo de `sessionAge` (linha 701-703) para usar o timestamp real do `lastRealInsertionMap` quando disponível, em vez de `existing.card_inserted_at`:

```text
// ANTES (linha 701-703):
const sessionAge = existing.card_inserted_at
  ? Date.now() - new Date(existing.card_inserted_at).getTime()
  : 0;

// DEPOIS:
const realInsertionForAge = lastRealInsertionMap.get(rec.plate);
const sessionAgeBase = realInsertionForAge?.timestamp || existing.card_inserted_at;
const sessionAge = sessionAgeBase
  ? Date.now() - new Date(sessionAgeBase).getTime()
  : 0;
```

Para o 23-IS-71:
- `lastRealInsertionMap["23-IS-71"]` = `2026-03-03 20:19:46` (ontem, do card_events)
- `sessionAge` = now - 20:19 ontem ≈ **13h** → entra no ramo `>= TWELVE_HOURS`
- `isStaleExact` = true (lastRealDate=Mar03 != today=Mar04, tmx=today)
- Veículo entra no bulk API lookup como `recheck_exact`

## Ficheiro

`supabase/functions/sync-trackit-data/index.ts`, linhas 701-703

## Impacto

- Única alteração: 3 linhas
- Sem efeitos colaterais: para veículos sem entrada no `lastRealInsertionMap`, cai no `existing.card_inserted_at` (comportamento atual)
- Corrige o 23-IS-71 e todos os outros veículos cujo `card_inserted_at` foi sobrescrito por tmx

