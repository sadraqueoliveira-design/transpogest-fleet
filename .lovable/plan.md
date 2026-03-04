

# Diagnóstico: 23-IS-71 — horário de inserção real (~05:00) nunca foi obtido

## Situação atual

| Campo | Valor |
|-------|-------|
| `vehicles.card_inserted_at` | `2026-03-04 09:00:09` (fallback tmx, não real) |
| Último `card_events` | Inserção a `2026-03-03 20:19:46` (ontem) |
| Remoção entre ontem e hoje | **Não registada** |
| Re-inserção hoje ~05:00 | **Não registada** |
| Logs `CARD-RECHECK-QUEUED-EXACT` | **Nenhum** (nunca disparou) |
| Logs `CARD-EVENTS-BULK` | **Nenhum** (bulk API nunca foi chamada) |

## Causa raiz

A sequência de fixes anteriores criou um ciclo que se auto-derrota:

1. O fix de "rechecks descartados → usar tmx" (ciclo anterior) atualizou `card_inserted_at` para `09:00` (hoje) via tmx
2. A condição `isStaleExact` verifica `insertedDate !== todayDate` — como agora é "hoje", a condição é **falsa**
3. O veículo entra no ramo `sessionAge >= TWELVE_HOURS` mas **não** como `recheck_exact`, e sim como `recheck` normal
4. Como `recheck` normal, tem prioridade 4 e é descartado pelo cap → preserva o timestamp tmx
5. O ciclo repete sem nunca chamar a API de eventos

Em paralelo, a API Trackit individual está a devolver `Unexpected token ,` para muitos MIDs — a chamada bulk nunca chegou a ser testada.

## Solução

### 1. Corrigir a condição de recheck_exact — usar card_events em vez de card_inserted_at

A condição atual compara `card_inserted_at` (que pode já ter sido sobrescrito por tmx) com hoje. Deve comparar o **último evento real** em `card_events` com a data de hoje.

**Ficheiro**: `supabase/functions/sync-trackit-data/index.ts`

Na secção de deteção de `isStaleExact` (linhas 756-761):

```typescript
// ANTES:
const insertedDate = existing.card_inserted_at ? new Date(existing.card_inserted_at).toDateString() : null;
const todayDate = new Date().toDateString();
const isStaleExact = insertedDate !== todayDate && tmxDate === todayDate;

// DEPOIS:
// Check if the LAST REAL card_event insertion for this plate is from a previous day
const lastCardEvent = await supabaseAdmin
  .from("card_events")
  .select("event_at")
  .eq("plate", rec.plate)
  .eq("event_type", "inserted")
  .order("event_at", { ascending: false })
  .limit(1)
  .single();
const lastRealInsertionDate = lastCardEvent.data?.event_at 
  ? new Date(lastCardEvent.data.event_at).toDateString() 
  : null;
const todayDate = new Date().toDateString();
const isStaleExact = lastRealInsertionDate !== null 
  && lastRealInsertionDate !== todayDate 
  && tmxDate === todayDate;
```

**Problema**: isto adiciona N queries à BD por ciclo. Alternativa mais eficiente:

### 1b. (Alternativa preferida) Pré-carregar últimos card_events por plate num único query

No início do processamento, fazer um único query que obtém o último `event_at` de inserção para todos os plates ativos. Guardar num Map. Usar esse Map na condição `isStaleExact`.

```typescript
// Before the main vehicle processing loop:
const { data: lastInsertions } = await supabaseAdmin
  .from("card_events")
  .select("plate, event_at")
  .eq("event_type", "inserted")
  .order("event_at", { ascending: false });

// Build map: plate -> last real insertion date string
const lastRealInsertionMap = new Map<string, string>();
for (const row of lastInsertions || []) {
  if (!lastRealInsertionMap.has(row.plate)) {
    lastRealInsertionMap.set(row.plate, new Date(row.event_at).toDateString());
  }
}

// In the isStaleExact check:
const lastRealDate = lastRealInsertionMap.get(rec.plate) || null;
const isStaleExact = lastRealDate !== null 
  && lastRealDate !== todayDate 
  && tmxDate === todayDate;
```

### 2. Garantir que o recheck_exact também usa existingCardInsertedAt do card_events

O `existingCardInsertedAt` passado ao lookup deve ser o timestamp real do último evento (não o tmx sobrescrito). Usar `lastCardEvent.event_at` em vez de `existing.card_inserted_at`.

### 3. Registar remoção + re-inserção no card_events quando bulk resulta em HIT

Quando o bulk API encontra o Event 45 para ~05:00, o sistema deve:
- Registar um evento `removed` (entre 20:19 de ontem e 05:00 de hoje)
- Registar um evento `inserted` às ~05:00

Isto já está implementado no bloco `CARD-RECHECK-HIT` (linhas 862-880+), mas só funciona se o bulk for chamado.

## Impacto esperado

- 23-IS-71 será classificado como `recheck_exact` porque o último `card_events` real é de 03/03
- O bulk API será chamado para este e outros veículos na mesma situação
- Se a API devolver Event 45, o horário será ~05:00
- Se não devolver (como acontece com os erros `Unexpected token ,`), ficará como `PENDING-EXACT` com o timestamp antigo preservado (honesto)

## Nota sobre erros da API

Muitos MIDs estão a devolver `Unexpected token ,` na API individual. O bulk API pode ter o mesmo problema. Se o 23-IS-71 (mid=3054) também falhar na bulk API, não há forma de obter o horário exato sem que a API Trackit funcione. Nesse caso o sistema logará `CARD-RECHECK-PENDING-EXACT`.

