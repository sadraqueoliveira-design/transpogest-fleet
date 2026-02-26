

## Melhorias no Historico de Cartoes

### 1. Aviso visual de motorista em dois veiculos simultaneamente

Na pagina `CardHistory.tsx`, apos calcular as sessoes, detetar motoristas cujas sessoes se sobrepõem em veiculos diferentes no mesmo periodo. Mostrar um alerta amarelo/laranja no topo da tabela listando os motoristas afetados e os veiculos, e destacar as linhas correspondentes na tabela com fundo amarelo.

**Logica de detecao:**
- Agrupar sessoes por `driver_name` (ou `card_number`)
- Para cada motorista com sessoes em veiculos diferentes, verificar se os intervalos temporais se sobrepõem (insercao de uma sessao antes da retirada de outra)
- Considerar sessoes "em curso" (sem `removed_at`) como ainda ativas

### 2. Auto-registar cartoes desconhecidos na tabela tachograph_cards

No `sync-trackit-data/index.ts`, quando um cartao nao e encontrado nas `tachograph_cards` (o log "Unknown card"), inserir automaticamente um novo registo na tabela `tachograph_cards` com o `card_number` e sem `driver_id`. Isto garante que o cartao fica registado para futura associacao e que os eventos subsequentes ja podem resolver o nome do motorista.

### 3. Suporte a sessoes que cruzam a meia-noite

Na query de `CardHistory.tsx`, alargar a janela temporal para tambem buscar eventos do dia anterior que nao tenham sido fechados (insercoes do dia anterior sem retirada correspondente). Isto resolve o caso de motoristas que inserem o cartao apos as 18h e so retiram no dia seguinte.

**Abordagem:** Buscar tambem insercoes do dia anterior que nao tenham retirada antes da meia-noite, para que aparecam como sessoes ativas ou com retirada no dia selecionado.

---

### Detalhes tecnicos

**Ficheiro: `src/pages/admin/CardHistory.tsx`**
- Importar `Alert`, `AlertTitle`, `AlertDescription` de `@/components/ui/alert` e `AlertTriangle` do lucide
- Adicionar `useMemo` para detetar sobreposicoes: agrupar sessoes por motorista, verificar se existem sessoes em veiculos diferentes com intervalos sobrepostos
- Renderizar alerta condicional antes da tabela quando ha sobreposicoes
- Adicionar classe `bg-yellow-50` nas `TableRow` de sessoes com conflito
- Alargar a janela de busca: `rangeStart` para -26h (em vez de -2h) para apanhar insercoes do dia anterior, e filtrar no frontend para mostrar apenas sessoes relevantes ao dia selecionado

**Ficheiro: `supabase/functions/sync-trackit-data/index.ts`**
- Apos o log "Unknown card", adicionar `upsert` na tabela `tachograph_cards` com `card_number` e `driver_name: null`, usando `onConflict: "card_number"` para nao duplicar
- Atualizar o `cardToDriverName` map com o novo registo para que os card_events subsequentes ja tenham o cartao mapeado

