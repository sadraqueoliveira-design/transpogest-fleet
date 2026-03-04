
Objetivo: mostrar no card o horário exato de inserção (evento real), não um aproximado por telemetria.

## Implementado

1. **Sub-fila de prioridade "recheck_exact"**: Rechecks com card_inserted_at de dia anterior e tmx de hoje são classificados como `recheck_exact` e processados via bulk API, separados do cap de 25 lookups.

2. **Chamada bulk por lote**: Função `fetchCardEventsBulk` faz uma única chamada `/ws/events` para todos os veículos em recheck_exact, em vez de 1 chamada por veículo.

3. **Removido fallback tmx para rechecks**: Nos ramos dropped e MISS, o sistema preserva o timestamp existente e loga `CARD-RECHECK-PENDING-EXACT` em vez de substituir por tmx.

4. **Janela temporal robusta**: Para rechecks, a pesquisa de eventos começa desde `existingCardInsertedAt - 1h` em vez de janela fixa de 24h.

5. **Logs de instrumentação**: `CARD-RECHECK-QUEUED-EXACT`, `CARD-RECHECK-HIT`, `CARD-RECHECK-PENDING-EXACT`.

## Validação

- Verificar logs: `CARD-RECHECK-QUEUED-EXACT` para 23-IS-71
- Verificar: `CARD-RECHECK-HIT` com timestamp ~05:00
- Se API não devolver evento 45: `CARD-RECHECK-PENDING-EXACT` (honesto, sem aproximação)
