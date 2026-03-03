

# Diagnóstico: driverList da Trackit excede o limite de 60s da Edge Function

## Resultados do Teste

- **11:59:10** — Função iniciou (boot 23ms)
- **11:59:11** — `[COMPLIANCE] Auchan: fetching driverList...`
- **12:00:06** — `[COMPLIANCE] Auchan: Signal timed out.` (55s depois)
- **12:00:15** — Shutdown

O endpoint `/ws/driverList` da Trackit demora consistentemente **>55 segundos** para a conta Auchan. O limite máximo da Edge Function é ~60s, tornando impossível receber a resposta dentro de uma única execução.

## Solução: Invocar por cliente individual

O problema é que a conta Auchan tem centenas de veículos, e a API Trackit demora demasiado a responder com todos. A solução é **invocar a função para um cliente específico por vez**, e usar o endpoint alternativo `/ws/driverListByPage` se disponível, ou aceitar que este endpoint específico é demasiado lento.

**Abordagem pragmática — usar o endpoint `vehiclesForUser` que já funciona:**

O `vehiclesForUser` já retorna dados de tacógrafo por veículo (campo `tac` no JSON). Em vez de depender do lento `driverList`, podemos extrair os dados de compliance diretamente da resposta `vehiclesForUser` que já é processada no `sync-trackit-data`.

### Alterações

**Editar `supabase/functions/sync-trackit-data/index.ts`:**
- Durante o processamento de cada veículo, extrair campos de compliance do objeto `tac` (que já existe na resposta `vehiclesForUser`)
- Guardar esses dados no `tachograph_status.tacho_compliance` durante o upsert normal
- Campos como `ds1` (driver state), `tac.1.idc` (card number), velocidade, RPM já estão disponíveis

**Remover `supabase/functions/sync-driver-compliance/index.ts`:**
- Já não é necessário — os dados são extraídos inline durante o sync de veículos

### Alternativa se precisamos mesmo do driverList

Se os campos específicos do `driverList` (como `total_drive_journay`, `perc_drive_week`, limites de condução) não estão disponíveis no `vehiclesForUser`, então:

1. **Filtrar por cliente** — passar `client_id` como parâmetro e invocar a função separadamente para cada cliente
2. **Aumentar para o máximo** — edge functions podem ter até 150s com `wall_clock_timeout` no config, mas o Lovable Cloud pode não suportar isto
3. **Cache parcial** — se a API responder parcialmente (streaming), ler o que vier antes do timeout

### Recomendação

Verificar primeiro se o `vehiclesForUser` já traz dados suficientes de compliance por veículo. Se sim, eliminamos completamente a dependência do lento `driverList`. Preciso verificar o que o JSON do `vehiclesForUser` contém para cada veículo relativamente a dados de condução/descanso.

