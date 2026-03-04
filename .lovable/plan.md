
Diagnóstico confirmado: o fluxo novo já está a funcionar parcialmente para o 23-IS-71, mas ainda não chega ao horário “~05:00”.

O que já está correto:
- O veículo entra em `recheck_exact` (log visto: `[CARD-RECHECK-QUEUED-EXACT] 23-IS-71 ...`).
- `vehicles.card_inserted_at` já não volta para o fallback tmx das 09:00.
- Estado atual em BD: `card_inserted_at = 2026-03-03 20:19:46.062+00` (último evento real conhecido).

Porque continua “igual” no dashboard:
- Não apareceu `CARD-RECHECK-HIT` para 23-IS-71.
- Ou seja: o bloco `bulk` não devolveu (ou não aproveitou) um Event 45 mais recente para esse MID.
- Resultado: o sistema preserva o timestamp real antigo (03/03 20:19), que é o comportamento de segurança atual quando não há evento novo válido.

Plano de implementação (próximo fix):
1) Robustecer processamento `recheck_exact` com fallback individual por veículo  
   - No bloco bulk (`exactRechecks`), quando `bulkResult` vier vazio/sem evento novo, executar `fetchCardEvents(mid, afterTs, customBegin)` para aquele veículo (segunda tentativa).
   - Só atualizar `card_inserted_at` se `eventMs > afterMs` (mantendo regra atual anti-regressão).

2) Normalizar chave de agrupamento no bulk  
   - Em `fetchCardEventsBulk`, converter `vehicleId` para número (`const vid = Number(e.vehicleId)`), ignorar inválidos.
   - Evita mismatch silencioso entre `Map<number,...>` e IDs vindos como string.

3) Adicionar logs de diagnóstico (obrigatório para fechar o ciclo)  
   - Antes do bulk: total de `exactRechecks` e lista reduzida de plates/MIDs.
   - Após bulk: quantos veículos retornaram evento.
   - Para cada miss: log explícito `bulk miss -> fallback individual`.
   - Para 23-IS-71: log dedicado com `afterTs`, `eventTs` e decisão final.

4) Manter política de dados correta  
   - Sem fallback para tmx em `recheck_exact` quando não há Event 45 válido.
   - Preservar timestamp real existente (comportamento já certo para compliance).

Validação após aplicar:
- Logs esperados para 23-IS-71 no próximo ciclo:
  - `CARD-RECHECK-QUEUED-EXACT`
  - `CARD-EVENTS-BULK ...`
  - ou `CARD-RECHECK-HIT ... exact re-insertion at ...`
  - ou `bulk miss -> fallback individual ...`
- Se a API devolver Event 45 de hoje (~05:00), dashboard atualiza para esse horário.
- Se não devolver, mantém 03/03 20:19 (estado real mais confiável atualmente).

Escopo:
- Apenas `supabase/functions/sync-trackit-data/index.ts`
- Sem alterações de schema/migração.
