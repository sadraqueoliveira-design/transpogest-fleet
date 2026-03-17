

# Corrigir contagem dos cards — incluir schedules baseados em horas

## Problema identificado

A função `getScheduleDaysRemaining` (usada para contar os stats dos cards) **não suporta a categoria "Revisão Horas"**. Quando um schedule tem apenas `next_due_hours` (sem `next_due_date`), retorna `null` e não é contado em nenhum card.

Mas o `ScheduleCell` (que pinta as células na grelha) **tem acesso ao veículo** e faz a conversão: `hoursRemaining = next_due_hours - engine_hours`, depois `daysRemaining = hoursRemaining / 8`. Daí que as células aparecem vermelhas mas não são contadas.

Adicionalmente, os stats contam **todos** os schedules da DB, ignorando os filtros de Cliente/Hub ativos.

## Alterações em `src/pages/admin/Maintenance.tsx`

1. **Criar lookup de veículos por ID** para poder aceder a `engine_hours` fora do ScheduleCell
2. **Atualizar `getScheduleDaysRemaining`** para aceitar um parâmetro opcional `vehicleEngineHours` e tratar "Revisão Horas":
   ```
   if (category === "revisão horas" && next_due_hours) {
     hoursRemaining = next_due_hours - vehicleEngineHours
     return Math.round(hoursRemaining / 8)
   }
   ```
3. **Atualizar o cálculo de `stats`** para passar `engine_hours` do veículo correspondente a cada schedule
4. **Filtrar stats pelos filtros ativos** (cliente, hub, categorias) para que os cards reflitam apenas os veículos visíveis na grelha

