

# Diagnóstico: 42-HX-75 — cartão reportado como presente apesar de removido

## Situação atual

**Logs confirmam o problema:**
- Linha 87: `[CARD-DEBUG] 42-HX-75: dc1=0000000750901003, tac.1.idc=0000000750901003 → using: 0000000750901003, ds1=0`
- A API Trackit **continua a reportar `dc1`** com o número do cartão mesmo depois de o motorista o ter removido fisicamente
- O `ds1=0` (repouso) confirma que o veículo está parado e o cartão provavelmente já foi retirado

**Cadeia de falha:**
1. A lógica `CARD-CACHED` (linha 181) só filtra quando a fonte é `tac.1.idc` — mas `dc1` também é stale/cached quando ds1=0
2. Como `dc1` está preenchido, `hasValidCard = true` → sistema trata o cartão como presente
3. A sessão tem ~31h → entra no `CARD-RECHECK` (prioridade 4, a mais baixa)
4. Com ~80+ veículos a pedir recheck e o cap em 10, o recheck do 42-HX-75 é **descartado** ou a função termina antes de o processar
5. Resultado: `card_inserted_at` é preservado com o valor antigo, nenhum evento de remoção é registado

## Solução

Estender a lógica `isCachedCardOnly` para também considerar `dc1` como potencialmente stale quando `ds1=0`, **mas apenas quando já existe uma sessão ativa há mais de X horas**. Isto garante que o sistema não descarta cartões legitimamente inseridos durante pausas curtas.

### Alterações

**Editar `supabase/functions/sync-trackit-data/index.ts`:**

1. **Na fase de comparação (linhas 555-600)**: Quando `ds1=0` e a sessão tem mais de 12h, forçar um recheck com prioridade elevada em vez de prioridade 4. Isto garante que veículos parados há muito tempo são verificados primeiro.

2. **Aumentar a prioridade de rechecks "stale"**: Adicionar um novo tipo de evento `recheck_stale` com prioridade 1 (logo após `inserted`) para sessões com `ds1=0` e mais de 12h de idade. Estas são as mais prováveis de serem cartões esquecidos ou removidos sem registo.

3. **Alternativa mais robusta**: Quando `dc1` reporta um cartão mas `ds1=0` e a sessão tem >12h, tratar como se o cartão não estivesse presente (similar ao `CARD-CACHED`). Isto dispara a remoção diretamente sem depender da API de eventos. Se o cartão estiver realmente inserido, o próximo sync com `ds1 != 0` irá re-detetá-lo.

**Abordagem recomendada — opção 3:**
- Na linha 181, estender: `const isCachedCardOnly = driverState1 === 0 && sessionAge > 12h`
- Isto requer acesso ao `existing.card_inserted_at` na fase de enriquecimento, que atualmente só está disponível na fase de comparação
- Solução: mover a verificação para a fase de comparação (linhas 555-600), adicionando uma condição que quando `ds1=0` e sessão >12h, force `newCardPresent = false`, disparando o caminho de remoção normal (linha 567-572)

### Implementação concreta

Na secção de comparação (~linha 573), antes do bloco `else if (newHasCard && existing.card_inserted_at)`:

```text
// When ds1=0 (rest) and session > 12h, treat dc1 as potentially stale
// This triggers removal path, which will be corrected on next sync if card is actually present
if (newHasCard && existing.card_inserted_at && sessionAge > 12h && ds1 === 0) {
  → treat as removal (same as line 567-572)
  → log as [CARD-STALE-REST]
}
```

Isto resolve o problema porque:
- Se o cartão foi realmente removido → remoção é registada corretamente
- Se o cartão está realmente inserido (pausa) → no próximo sync quando ds1 mudar para 1/2/3, o cartão será re-detetado e uma nova inserção será registada
- Não depende da API de eventos (que pode falhar ou ser descartada pelo cap)

