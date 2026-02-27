

## Adicionar auto-refresh de 30 segundos ao Dashboard

O Dashboard atualmente so atualiza os dados ao carregar a pagina ou quando recebe eventos via Realtime (novas manutencoes/solicitacoes). Ao contrario do Mapa ao Vivo, nao tem um ciclo de auto-refresh periodico.

### Alteracao

Adicionar ao `Dashboard.tsx` o mesmo mecanismo de auto-refresh que ja existe no `LiveMap.tsx`:

1. **Dois novos estados**: `autoRefresh` (boolean, default `true`) e `countdown` (number, default `30`)
2. **useEffect com intervalo de 1 segundo**: decrementa o countdown e quando chega a 0, chama `fetchVehicles()` e reinicia para 30
3. **Botao de toggle**: ao lado do botao de sync existente, mostrar botao "Auto 28s" / "Auto OFF" igual ao do LiveMap

### Detalhes tecnicos

- Ficheiro: `src/pages/admin/Dashboard.tsx`
- Adicionar estados `autoRefresh` e `countdown` (linhas ~96)
- Adicionar useEffect para o intervalo (apos o useEffect existente, ~linha 155)
- Adicionar botao de toggle auto-refresh na barra de ferramentas junto ao botao RefreshCw existente

