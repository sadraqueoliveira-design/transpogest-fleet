

# Fix: Fallback TMX para quando API de eventos Trackit falha

## Problema confirmado

Os logs mostram claramente que a API Trackit `/ws/events` está a devolver `{"error":"Unexpected token ,","data":[]}` — HTTP 200 mas com erro interno do servidor Trackit. Isto afeta **todos** os veículos, não apenas o 23-IS-71. O JSON é válido (parse funciona), mas o campo `error` é truthy e `data` vem vazio. Retries não resolvem porque o erro é determinístico do lado do fornecedor.

Resultado: todos os veículos em `recheck_exact` ficam presos com timestamps do dia anterior.

## Solução

Quando a API de eventos falha para veículos em `recheck_exact` e o `existingCardInsertedAt` é de um dia anterior ao atual, usar o **timestamp TMX da telemetria** (que já temos do mesmo ciclo de sync) como fallback. Os eventos são registados em `card_events` com uma coluna `source` para distinguir:
- `source = 'trackit_event'` — timestamp exacto da API (Event 45/46)
- `source = 'tmx_fallback'` — timestamp estimado da telemetria (usado quando API falha)

### Alterações

**1. Migração: adicionar coluna `source` à tabela `card_events`**
```sql
ALTER TABLE public.card_events 
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'trackit_event';
```
Isto permite distinguir em auditoria quais timestamps são exactos vs estimados.

**2. Em `sync-trackit-data/index.ts` — bloco `CARD-RECHECK-PENDING-EXACT` (linhas 1043-1046)**

Substituir a preservação passiva por lógica TMX fallback:
- Obter `tmx` do veículo (já disponível em `filteredVehicles[lookup.idx].data.drs.tmx`)
- Se `existingCardInsertedAt` é de dia anterior E `tmx` é de hoje:
  - Usar `tmx` como novo `card_inserted_at`
  - Registar em `card_events`: remoção no antigo timestamp + inserção no tmx, ambos com `source = 'tmx_fallback'`
  - Log: `[CARD-RECHECK-TMX-FALLBACK]`
- Se mesma data ou sem tmx: manter comportamento actual (preservar)

**3. Aplicar mesma lógica no bloco de lookups individuais** (linhas 1068-1120) quando `fetchCardEvents` retorna null por erro de API.

**4. Na página CardHistory** — mostrar badge visual para eventos `tmx_fallback` (ex: badge amarelo "Estimado") para que gestores saibam quais horários são exactos vs estimados.

### Impacto

- Todos os ~20 veículos em `recheck_exact` passam a mostrar horário de hoje (via TMX)
- Os `card_events` ficam marcados como `tmx_fallback` — auditoria sabe que não é Event 45 exacto
- Quando a API Trackit voltar a funcionar, o próximo ciclo capta o Event 45 real e substitui automaticamente (porque `eventMs > afterMs`)
- Declarações de atividade podem usar o TMX como referência operacional, com nota de fonte

### Ficheiros a alterar
- `supabase/functions/sync-trackit-data/index.ts` — lógica TMX fallback
- `src/pages/admin/CardHistory.tsx` — badge "Estimado" para source=tmx_fallback
- Migração SQL — coluna `source` em `card_events`

