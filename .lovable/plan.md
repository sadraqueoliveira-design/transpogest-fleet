

# Corrigir contagem dos cards de resumo na Manutenção

## Problema

Existe uma inconsistência entre a cor das células na grelha e a contagem nos cards de resumo:

- **`getDaysStatus`** (cor das células): trata `daysRemaining <= 15` como **vermelho** ("Crítico") com estilo `bg-destructive`
- **`getScheduleStatus`** (contagem dos cards): trata `daysRemaining < 0` como "expired" e `0-30 dias` como "urgent"

Ou seja, células com 1-15 dias restantes aparecem **vermelhas** na grelha mas são contadas como "Urgentes" (laranja) nos cards. O utilizador vê mais vermelhos na grelha do que o número 9 indica.

## Solução

Alinhar as duas funções adicionando o nível "Crítico" (≤15d) à contagem. O card "Expirados" passa a mostrar **Expirados + Críticos**, ou então criamos um card separado para "Críticos".

A abordagem mais simples: incluir os itens com ≤15 dias na contagem do card "Expirados", renomeando para "Expirados / Críticos". Alternativamente, podemos separar em dois cards distintos.

**Abordagem recomendada**: Alterar `getScheduleStatus` para incluir um estado "critical" (≤15d) e somar "expired + critical" no card vermelho, mantendo coerência visual.

## Alterações em `src/pages/admin/Maintenance.tsx`

1. **`getScheduleStatus`**: Adicionar estado `"critical"` para `daysRemaining >= 0 && daysRemaining <= 15`
2. **Contagem `stats`**: Contar `critical` separadamente
3. **Card vermelho**: Mostrar `expired + critical` como total, com label "Expirados / Críticos"
4. **Card laranja**: Mostrar apenas `urgent` (16-30 dias), ajustando label para "Urgentes (16-30d)"

