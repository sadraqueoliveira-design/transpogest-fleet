
# Fix aplicado: isStaleExact usa card_events em vez de vehicles.card_inserted_at

## O que mudou

1. **Pré-carregamento de últimas inserções reais** — Antes do loop de veículos, um único query obtém o último `event_at` de inserção por plate da tabela `card_events`. Guardado num Map (`lastRealInsertionMap`).

2. **Condição `isStaleExact` corrigida** — Em vez de comparar `vehicles.card_inserted_at` (que pode ter sido sobrescrito por tmx), compara a data do último evento real em `card_events` com hoje. Isto garante que o 23-IS-71 (cujo último evento real é de 03/03) é classificado como `recheck_exact`.

3. **`existingCardInsertedAt` real** — O timestamp passado ao bulk lookup é agora o do último `card_events` real, não o `card_inserted_at` (tmx) do veículo.

## Validação esperada

No próximo ciclo de sync (~5 min):
- Log `[CARD-EVENTS-MAP] Pre-loaded last real insertions for N plates`
- Log `[CARD-RECHECK-QUEUED-EXACT] 23-IS-71: ...last REAL event=...03/03...`
- Se a API Trackit devolver Event 45: `[CARD-RECHECK-HIT] 23-IS-71: exact re-insertion at 2026-03-04T05:xx:xx`
- Se não: `[CARD-RECHECK-PENDING-EXACT] 23-IS-71: no event 45 found via bulk`
