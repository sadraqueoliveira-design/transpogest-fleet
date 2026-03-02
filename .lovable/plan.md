
Objetivo: corrigir de forma definitiva o caso em que o `gap_end_date` volta a avançar (como aconteceu novamente para o Paulo, de 03:21 para 11:56), e ajustar o registo já afetado.

Diagnóstico confirmado
- A declaração `b24b7085-dd4a-4b86-82a0-59a2f33b192a` está com:
  - `gap_start_date`: `2026-02-24 13:05:43.966+00`
  - `gap_end_date`: `2026-03-02 11:56:57.808+00` (errado)
- Existe evento real em `card_events` para o mesmo motorista:
  - `event_type='inserted'` em `2026-03-02 03:19:40.703+00` (hora correta de retorno/cartão inserido)
- A lógica atual em `supabase/functions/sync-trackit-data/index.ts` continua vulnerável a “arrasto” porque usa `decl.gap_end_date` como âncora e procura a próxima atividade `> gap_end_date`, empurrando o fim do gap a cada sincronização.

Implementação proposta

1) Corrigir a lógica no `sync-trackit-data` para usar âncora estável
- Ficheiro: `supabase/functions/sync-trackit-data/index.ts` (bloco “UPDATE gap_end_date ON DRAFT DECLARATIONS”).
- Alterar o `select` de declarações para incluir `gap_start_date`:
  - de: `select("id, driver_id, gap_end_date")`
  - para: `select("id, driver_id, gap_start_date, gap_end_date")`
- Nova regra de cálculo do candidato a `gap_end_date`:
  1. Preferir primeiro `card_events.event_at` com `event_type='inserted'` e `event_at > decl.gap_start_date` (ordem ascendente, `limit 1`).
  2. Fallback para `driver_activities.start_time` com `start_time > decl.gap_start_date` (ordem ascendente, `limit 1`).
- Isto fixa o “primeiro retorno real após início do gap” e impede avanço para últimas atividades do dia.

2) Impedir atualização para horários mais tardios
- Aplicar regra de segurança antes do `update`:
  - Só atualizar quando houver `candidateGapEnd` e:
    - `decl.gap_end_date` vazio, ou
    - `candidateGapEnd < decl.gap_end_date`.
- Resultado: o sistema só pode corrigir para mais cedo (ou preencher), nunca “arrastar” para frente.

3) Corrigir o registo atual do Paulo (dados)
- Atualizar a declaração existente para o valor correto do retorno:
  - `gap_end_date = '2026-03-02T03:19:40.703Z'`
  - `WHERE id = 'b24b7085-dd4a-4b86-82a0-59a2f33b192a'`
- Como a declaração está `signed`, manter `status` e assinaturas; apenas corrigir o campo temporal.
- Observação: atualmente `signed_pdf_url` está nulo nesse registo, portanto não há PDF final assinado a desalinhar com este ajuste.

4) Validação técnica após aplicar
- Validar no backend:
  - Query da declaração do Paulo confirma `gap_end_date` em `03:19:40.703+00`.
- Validar estabilidade:
  - Executar/simular nova sincronização.
  - Confirmar que o mesmo `gap_end_date` não muda para 04:21, 10:51, 11:56, etc.
- Validar UI:
  - Em `/admin/declaracoes`, verificar que a linha do Paulo mostra intervalo correto (24/02 13:05 → 02/03 03:19).

Riscos e mitigação
- Risco: múltiplos eventos “inserted” após o gap.
  - Mitigação: usar sempre o mais antigo (`order asc limit 1`).
- Risco: ausência de evento em `card_events`.
  - Mitigação: fallback para primeira `driver_activity` após `gap_start_date`.
- Risco: regressão futura por mudança de lógica.
  - Mitigação: condição monotónica (`candidate < current`) + logs explícitos de decisão (updated/skipped).

Sequência de execução
1. Atualizar lógica da função `sync-trackit-data`.
2. Aplicar correção de dados na declaração do Paulo.
3. Validar via queries.
4. Confirmar no ecrã de Declarações que o horário ficou estável e correto.

Secção técnica (resumo de regra final)
- `gap_end_date` deve representar o primeiro sinal de retorno após `gap_start_date`.
- Fonte de verdade preferencial: `card_events(inserted)`.
- Fonte secundária: `driver_activities(start_time)`.
- Atualização só permitida se mover para trás (mais cedo), nunca para frente.
