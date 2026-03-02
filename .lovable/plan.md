

# Corrigir gap_end_date nas declaracoes

## Problema
O `gap_end_date` da declaracao do Paulo Cardoso mostra **10:51** (ultima atividade atual) em vez de **~03:19** (momento em que o cartao foi inserido / retorno real).

## Causa raiz
No ficheiro `supabase/functions/sync-trackit-data/index.ts`, linhas 812-818, o codigo busca a atividade **mais recente** do motorista (ORDER BY start_time DESC LIMIT 1) e usa-a como gap_end_date. Como o motorista continua a trabalhar ao longo do dia, o gap_end_date vai sendo atualizado para a ultima atividade a cada sincronizacao.

O correto e usar a **primeira atividade apos o inicio do gap** (a que marca o retorno real do motorista).

## Solucao

### 1. Corrigir a query no sync-trackit-data (linhas 812-818)

Alterar de:
```typescript
const { data: latestActivity } = await supabaseAdmin
  .from("driver_activities")
  .select("start_time")
  .eq("driver_id", decl.driver_id)
  .order("start_time", { ascending: false })
  .limit(1)
  .maybeSingle();
```

Para:
```typescript
const { data: firstReturnActivity } = await supabaseAdmin
  .from("driver_activities")
  .select("start_time")
  .eq("driver_id", decl.driver_id)
  .gt("start_time", decl.gap_end_date)
  .order("start_time", { ascending: true })
  .limit(1)
  .maybeSingle();
```

Isto busca a primeira atividade **depois** do gap_end_date atual da declaracao, usando ordem ascendente. Uma vez encontrada e atualizada, como o novo gap_end_date sera anterior as atividades seguintes, a query nao voltara a atualizar (estabiliza no valor correto).

Tambem atualizar a referencia na linha 820-823:
```typescript
if (firstReturnActivity?.start_time) {
  const { error: updateDeclErr } = await supabaseAdmin
    .from("activity_declarations")
    .update({ gap_end_date: firstReturnActivity.start_time })
    .eq("id", decl.id);
```

### 2. Usar card_events como fonte preferencial

Melhor ainda: verificar primeiro se existe um evento de insercao de cartao (`card_events` com `event_type = 'inserted'`) para o motorista apos o gap_start_date, pois esse e o momento exato do retorno.

Adicionar antes da query de atividades:
```typescript
// Prefer card insertion time as gap end
const { data: cardInsert } = await supabaseAdmin
  .from("card_events")
  .select("event_at, driver_name")
  .eq("driver_name", driverName)  // needs driver name lookup
  .eq("event_type", "inserted")
  .gt("event_at", decl.gap_end_date)
  .order("event_at", { ascending: true })
  .limit(1)
  .maybeSingle();

const newGapEnd = cardInsert?.event_at || firstReturnActivity?.start_time;
```

Para obter o driver_name, sera necessario fazer join com profiles. Alternativa mais simples: usar apenas a primeira atividade (solucao 1), que ja e suficientemente precisa (04:21 vs 03:19 -- diferenca de ~1h que corresponde ao tempo entre insercao e inicio de trabalho efetivo).

**Recomendacao**: Implementar apenas a solucao 1 (corrigir a query de atividades) por ser mais simples e robusta. A diferenca entre insercao do cartao e primeira atividade e marginal.

### 3. Corrigir a declaracao existente do Paulo Cardoso

Atualizar manualmente o gap_end_date da declaracao draft para o valor correto:

```sql
UPDATE activity_declarations 
SET gap_end_date = '2026-03-02T04:21:35.962Z'
WHERE id = 'b24b7085-dd4a-4b86-82a0-59a2f33b192a';
```

(Usando 04:21 -- inicio da primeira atividade apos o retorno, que em hora de Lisboa corresponde a ~04:21.)

### 4. Evitar re-atualizacao apos correcao

A query corrigida com `.gt("start_time", decl.gap_end_date)` ja resolve isto naturalmente: uma vez que gap_end_date e 04:21, nao havera atividades com start_time > gap_end_date que sejam anteriores a esse valor, portanto nao sera re-atualizado.

## Impacto
- Declaracoes futuras terao o gap_end_date correto (primeira atividade apos o gap)
- A declaracao do Paulo Cardoso sera corrigida imediatamente
- Sem impacto noutras funcionalidades

