

# Fix: TMX Fallback usa timestamp errado (hora do sync, não hora de inserção)

## Problema

O fallback TMX usa `origVFallback?.data?.drs?.tmx` que é o **timestamp da última leitura de telemetria** — ou seja, ~quando o sync corre (~09:30), não quando o cartão foi fisicamente inserido (~02:30).

Para o 42-HX-80: o cartão foi inserido às ~02:30. O primeiro ciclo de sync que detectou o timestamp antigo e disparou o fallback foi às ~09:30. O TMX nesse momento era ~09:30. Resultado: regista 09:30 como hora de inserção — **7 horas de erro**.

Este problema afeta **todos** os veículos com fallback TMX, não apenas o 42-HX-80. A diferença varia conforme a hora a que o fallback é ativado pela primeira vez.

## Causa raiz

`tmx` = "timestamp da última mensagem de telemetria" ≠ "timestamp de inserção do cartão". Não existe nenhum campo na telemetria Trackit que indique quando o cartão foi inserido — essa informação só existe no Event 45 da API `/ws/events`, que está avariada.

## Solução proposta

Em vez de usar o TMX do ciclo atual, **procurar o TMX mais antigo de hoje** na tabela `card_events` para este veículo. Se já existir um `tmx_fallback` prévio, manter esse timestamp (que é mais próximo da hora real). Se não existir nenhum, usar uma abordagem mais conservadora:

### Alternativa: Usar a primeira ignição/movimento de hoje

O Trackit fornece `pos.tmx` (posição) que só atualiza quando o veículo se move. Se compararmos o `pos.tmx` com o momento em que o cartão apareceu pela primeira vez na telemetria, podemos estimar melhor.

**Mas o problema fundamental persiste**: sem Event 45, não temos o timestamp exato.

### Abordagem pragmática recomendada

1. **Não sobrescrever com TMX do ciclo atual** — em vez disso, quando o fallback precisa de disparar, verificar primeiro se já existe um `card_events` de `inserted` com `source = 'tmx_fallback'` para hoje neste veículo. Se existir, manter esse e não criar duplicado.

2. **Para o primeiro fallback do dia**: registar o timestamp como **meia-noite (00:00) do dia atual** em vez do TMX. Isto é menos errado: sabemos que o cartão foi inserido "em algum momento de hoje", e meia-noite é o limite inferior. O badge "Estimado" já avisa o utilizador.

3. **Quando a API recuperar**: o Event 45 real substitui automaticamente o fallback (lógica existente de `eventMs > afterMs`).

### Alterações em `sync-trackit-data/index.ts`

**Bloco TMX fallback (linhas 1043-1084):**
- Antes de criar novos `card_events`, verificar se já existe um evento `inserted` com `source = 'tmx_fallback'` para hoje neste veículo
- Se existir: usar esse timestamp (preservar o mais antigo, que é mais próximo da hora real)
- Se não existir: usar o **primeiro TMX disponível** — mas como não o temos, usar o TMX atual mas com uma nota clara no log

**Opção alternativa** (mais precisa): Query `card_events` para encontrar o último `removed` event para este veículo. A inserção real será pouco depois dessa remoção. Se a remoção foi às 23:00 de ontem, a inserção terá sido entre as 23:00 e o início da viagem de hoje.

### Impacto
- Reduz o erro de horas para zero (se já houver fallback prévio) ou para um máximo definido
- Não cria duplicados de eventos TMX fallback
- Badge "Estimado" continua visível na UI

### Ficheiros a alterar
- `supabase/functions/sync-trackit-data/index.ts` — lógica de deduplicação e timestamp mais preciso no fallback

