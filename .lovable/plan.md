
Objetivo: mostrar no card o horário exato de inserção (evento real), não um aproximado por telemetria.

Contexto confirmado:
- O 23-IS-71 entra em `CARD-RECHECK`, mas não aparece `CARD-RECHECK-HIT` nem `CARD-RECHECK-MISS`.
- Em BD, `vehicles.card_inserted_at` do 23-IS-71 ficou preso em `2026-03-03 20:19:46+00`.
- A telemetria (`tmx`) está atualizada hoje, então o bloqueio está no processamento de recheck exato.

Plano de implementação (sem mexer em UI, só backend function):
1) Garantir “recheck exato” para casos suspeitos de horário stale
- Ficheiro: `supabase/functions/sync-trackit-data/index.ts`
- Na deteção de sessão antiga com mesmo cartão (`eventType: "recheck"`), criar uma subfila de prioridade para casos com:
  - `card_present = true`
  - `card_inserted_at` de dia anterior
  - `tmx` de hoje
- Estes casos (incluindo 23-IS-71) não podem ficar atrás de rechecks normais.

2) Trocar chamadas por veículo para chamada bulk por lote (mais fiável)
- Substituir a lógica de recheck que hoje faz 1 chamada `/ws/events` por veículo por uma chamada por lote de veículos (ex.: 20 mids por request).
- Continuar a procurar eventos 45/46, mas agregando por `vehicleId` no resultado.
- Aplicar `afterTimestamp` por veículo no pós-processamento (igual à regra atual de “só eventos após timestamp antigo”).

3) Remover fallback para `tmx` no caminho “quero exato”
- Nos ramos de recheck (`dropped` e `MISS`), não gravar `tmx` como definitivo para `card_inserted_at`.
- Em vez disso:
  - manter valor atual e marcar log de pendência exata (ex.: `CARD-RECHECK-PENDING-EXACT`) quando não houver evento 45 válido.
- Assim evita-se “hora aproximada” quando o requisito é exatidão.

4) Janela temporal de eventos mais robusta para recheck
- Para recheck, usar janela de pesquisa baseada em `existingCardInsertedAt` (ex.: desde timestamp antigo - margem) em vez de janela fixa curta.
- Objetivo: não perder reinserções que fiquem fora de uma janela rígida.

5) Instrumentação de logs para provar resolução
- Adicionar logs claros por matrícula:
  - `CARD-RECHECK-QUEUED-EXACT`
  - `CARD-RECHECK-HIT` (com timestamp encontrado)
  - `CARD-RECHECK-PENDING-EXACT` (sem evento encontrado)
- Isto permite validar rapidamente no próximo ciclo se o 23-IS-71 foi realmente resolvido com hora exata.

Validação após deploy:
1. Verificar logs do `sync-trackit-data` no ciclo seguinte:
- Esperado para 23-IS-71: `CARD-RECHECK-HIT ... inserted at 2026-03-04T05:xx:xx...`

2. Confirmar dados persistidos:
- `vehicles.card_inserted_at` do 23-IS-71 atualizado para hoje ~05h
- `card_events` com sequência correta (remoção antiga + nova inserção, quando aplicável)

3. Confirmar no dashboard:
- O card da viatura passa a mostrar hora exata de hoje (não 03/03 20:19, nem fallback por `tmx`).

Detalhe técnico importante:
- Se a API externa não devolver evento 45 para esse período, não existe forma de “inventar exatidão”. Neste caso o sistema deve deixar explícito que está pendente de evento real (sem substituir por hora aproximada).
