
Corrigir a contagem dos cards na página de Manutenção alinhando a lógica dos cards com a lógica real das células da grelha.

1. Problema identificado
- A função `getScheduleDaysRemaining()` está a comparar `schedule.category === "lavagem"` em minúsculas.
- Na base de dados e na grelha a categoria usada é `Lavagem`.
- Resultado: as células de Lavagem aparecem com cor na grelha, mas muitos desses registos não entram nas contagens dos cards.
- Confirmei também que existem muitos registos de `Lavagem` com apenas `last_service_date`, por isso este erro afeta bastante os totais.

2. Correção proposta
- Normalizar a categoria dentro de `getScheduleDaysRemaining()` com algo como `schedule.category.trim().toLowerCase()`.
- Usar essa versão normalizada para tratar:
  - `lavagem`
  - `revisão horas`
- Isto garante que as contagens dos cards usam exatamente os mesmos casos reais que aparecem nos dados.

3. Melhorar robustez da lógica
- Extrair a lógica comum de cálculo para um helper único, por exemplo:
  - calcular `daysRemaining`
  - calcular `status`
- Fazer com que:
  - `ScheduleCell`
  - cálculo de `stats`
  - filtro por card (`activeStatusFilter`)
  usem a mesma função partilhada.
- Assim evitamos novas divergências entre “o que a célula mostra” e “o que o card conta”.

4. Resultado esperado
- Os cards passam a contar também os registos de `Lavagem` que já estão visíveis na grelha.
- O total do card vermelho deixa de ficar abaixo do número real de células vermelhas visíveis.
- As contagens continuam coerentes com filtros de cliente, hub e categoria.

5. Ficheiro a alterar
- `src/pages/admin/Maintenance.tsx`

6. Validação após implementação
- Verificar o card `Expirados / Críticos`
- Comparar com as células vermelhas visíveis na grelha
- Testar também com:
  - `Lavagem`
  - `Revisão Horas`
  - filtros de Cliente / Hub / Categoria
