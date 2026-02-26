
Objetivo: corrigir o falso estado “🪪 Sem Cartão” no veículo 37-ST-20 (em andamento), garantindo que o painel diferencie corretamente entre “sem cartão físico” e “cartão presente mas não mapeado”.

Resumo do diagnóstico (com evidência)
- O backend está a detetar cartão no Trackit para 37-ST-20:
  - Log: `[CARD-DEBUG] 37-ST-20: dc1=N/A, tac.1.idc=0000001983970000 ... → using: 0000001983970000`
- No entanto, na tabela `vehicles`, o `tachograph_status` gravado contém apenas o bloco `drs` (ex.: `ds1`, `rpm`, `tmx`), sem `tac.1.idc`.
- O frontend do Dashboard decide “Sem Cartão” com base apenas em `tacho.dc1`:
  - `driverCard = tacho.dc1 || null`
  - Se `!driverCard`, mostra badge vermelho “🪪 Sem Cartão”.
- Resultado: quando o cartão vem em `tac.1.idc` (e não em `dc1`), o UI marca incorretamente “Sem Cartão”.
- Adicionalmente, esse cartão (`0000001983970000`) existe em `tachograph_cards`, mas sem `driver_id`; por isso também aparece “Unknown card” no sync. Isto explica falta de associação a motorista, mas não deveria virar “Sem Cartão”.

Implementação proposta (sem alterar base de dados)
1) Corrigir origem de verdade do cartão no sync
- Ficheiro: `supabase/functions/sync-trackit-data/index.ts`
- Alterar construção de `tachograph_status` para incluir campos derivados persistidos (além do `drs`):
  - `card_slot_1` (valor normalizado detetado: `drs.dc1 || tac.1.idc || exd.eco.idc || drs.idc`)
  - `card_present` (boolean)
  - `card_source` (`dc1` | `tac.1.idc` | `exd.eco.idc` | `drs.idc` | `none`)
- Manter compatibilidade com estrutura atual (não remover `drs`), apenas enriquecer o JSON.

2) Unificar parsing de cartão no Dashboard
- Ficheiro: `src/pages/admin/Dashboard.tsx`
- Criar helper único para extrair estado de cartão do `tachograph_status`:
  - priorizar `card_slot_1`/`card_present` novos;
  - fallback legacy para `dc1`.
- Substituir usos atuais de `getDc1`/`driverCard` por este helper nos pontos:
  - pesquisa por motorista;
  - popups/labels de mapa;
  - cartão compacto da frota.

3) Corrigir regra de apresentação do badge no cartão da frota
- Estado visual proposto:
  - Se há motorista resolvido: mostrar `👤 Nome`.
  - Se há cartão presente mas sem motorista mapeado: mostrar badge neutro/aviso “🪪 Cartão não identificado”.
  - Só mostrar badge vermelho “🪪 Sem Cartão” quando `card_present === false`.
- Assim elimina-se o falso positivo “Sem Cartão” com veículo em andamento.

4) Ajustar exibição de “Última Inserção”
- No cartão compacto, mostrar `card_inserted_at` quando `card_present === true` (não apenas quando existe `dc1`), para não ocultar inserção válida de cartões sem `dc1`.

5) Validação funcional após implementação
- Forçar sincronização e validar:
  - 37-ST-20 não aparece mais como “Sem Cartão” se `tac.1.idc` estiver presente;
  - deve aparecer “Cartão não identificado” enquanto não houver mapeamento para motorista.
- Confirmar no registo do veículo que `tachograph_status` passou a incluir os campos derivados (`card_slot_1`, `card_present`, `card_source`).
- Verificar regressão em outros veículos:
  - com `dc1` preenchido continuam corretos;
  - sem cartão real continuam “Sem Cartão”.

Ação operacional recomendada (em paralelo, não bloqueante)
- No ecrã de cartões de tacógrafo, mapear `0000001983970000` a um `driver_id` válido (ou criar perfil e associar).
- Isto resolve o “Unknown card” e permitirá atribuição automática de motorista no `current_driver_id`.

Impacto esperado
- O estado “Sem Cartão” passa a refletir ausência real de cartão físico.
- Veículos em andamento com cartão não mapeado deixam de aparecer com erro visual crítico.
- Melhor consistência entre backend (deteção real) e frontend (estado exibido).
