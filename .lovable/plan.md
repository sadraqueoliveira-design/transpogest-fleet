
Diagnóstico

- Validei o código da página e os dados da base. Não há duplicados nem registos órfãos no planeamento de manutenção, por isso o erro está na lógica do frontend.
- O problema principal está aqui: os cards usam `filteredVehicles` para calcular `stats`.
- Só que `filteredVehicles` já aplica o `activeStatusFilter`. Resultado: quando clicas num card, as contagens passam a ser recalculadas sobre um subconjunto de veículos, em vez do universo filtrado normal.
- Além disso, depois dessas viaturas serem escolhidas, os cards voltam a contar todos os schedules desses veículos, incluindo estados diferentes. Isso explica porque as contagens “pioram”.

O que vou corrigir

1. Separar filtros “base” dos filtros por card
- Criar uma base comum com:
  - pesquisa
  - cliente
  - hub
  - categorias
- Essa base será a única usada para calcular os cards.

2. Usar o filtro do card só na grelha
- `activeStatusFilter` vai servir apenas para:
  - decidir que veículos entram na grelha
  - destacar/esmaecer células
- Os números dos cards deixam de mudar por causa do próprio card clicado.

3. Unificar a lógica de cálculo
- Centralizar o cálculo de:
  - `daysRemaining`
  - `status`
  - correspondência com o card ativo
- Assim cards, grelha e filtros passam a usar exatamente a mesma regra.

4. Endurecer validações de campos
- Trocar checks “truthy” por checks explícitos (`!= null`) nas categorias com horas/km/datas, para não ignorar valores válidos.

Ficheiro a alterar

- `src/pages/admin/Maintenance.tsx`

Resultado esperado

- As contagens dos cards ficam estáveis e corretas.
- Ao clicar num card, a grelha é filtrada/destacada, mas os números dos cards não “saltam” nem degradam.
- Cliente, Hub, Pesquisa e Categoria continuam a afetar corretamente os cards.
- A página passa a refletir melhor o total real dos schedules dentro do contexto visível.

Detalhes técnicos

- Introduzir algo como:
  - `baseFilteredVehicles`
  - `visibleVehicles`
  - `getScheduleStatusForVehicle(schedule, vehicle)`
  - `matchesActiveStatusFilter(status, activeStatusFilter)`
- `stats` deve depender da base filtrada, nunca de `visibleVehicles` quando essa lista já tiver o filtro do card aplicado.
