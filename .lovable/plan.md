

# Filtrar células da grelha pelo status do card selecionado

## Problema

Quando o utilizador clica num card (ex: "Expirados / Críticos"), a grelha mostra o veículo inteiro — incluindo células verdes/ok. O utilizador espera ver **apenas** as células que correspondem ao status do card.

## Solução

Passar o `activeStatusFilter` ao componente `ScheduleCell`. Quando um filtro de status está ativo, as células cujo status **não corresponde** ao filtro selecionado ficam visualmente esmaecidas (opacidade reduzida ou cinzento neutro), destacando apenas as relevantes.

Alternativa: esconder completamente as células não correspondentes (mostrar "—"), mas isto pode confundir pois remove contexto. A abordagem de esmaecer é mais intuitiva.

## Alterações em `src/pages/admin/Maintenance.tsx`

1. **`ScheduleCell`**: Adicionar prop `activeStatusFilter`. Quando o filtro não é `"all"`, calcular o status da célula e, se não corresponder, aplicar classe `opacity-20` ao conteúdo (ou fundo neutro `bg-muted/30` em vez da cor do status).

2. **Chamada do `ScheduleCell`** (~linha 834): Passar `activeStatusFilter={activeStatusFilter}`.

3. **Lógica de correspondência**: Para o filtro `"expired"`, considerar match se status é `"expired"` ou `"critical"` (consistente com o card). Para os restantes, match direto.

