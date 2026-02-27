

## Corrigir persistência do raio de proximidade

### Problema

O slider usa `onValueChange` tanto para atualizar o estado local como para gravar no backend. Como `onValueChange` dispara em cada pixel de arrasto, são enviados muitos upserts em paralelo (ex: 2.0, 1.5, 1.0). Devido a condições de corrida, o ultimo upsert a completar pode nao ser o valor final, fazendo com que um valor intermedio fique gravado.

### Solucao

Usar `onValueCommit` do Radix Slider (dispara apenas quando o utilizador larga o slider) para gravar no backend, mantendo `onValueChange` apenas para a atualizacao visual imediata.

### Alteracao

Ficheiro: `src/pages/admin/Dashboard.tsx`

1. No `onValueChange` do Slider, voltar a usar apenas `setProximityRadius(v)` para feedback visual imediato
2. Adicionar `onValueCommit` ao Slider que chama `updateProximityRadius(v)` para gravar no backend apenas quando o utilizador larga o slider
3. A funcao `updateProximityRadius` passa a apenas gravar no backend (sem chamar `setProximityRadius`, pois o estado ja foi atualizado pelo `onValueChange`)

