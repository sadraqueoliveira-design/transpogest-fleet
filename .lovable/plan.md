
# Mostrar hora de inserção do cartão no tacógrafo

## Objetivo
Adicionar uma coluna na tabela de Cartões de Tacógrafo que mostre a última vez que o motorista inseriu o cartão (baseado na atividade mais recente registada em `driver_activities`).

## Alterações

### Ficheiro: `src/pages/admin/TachographCards.tsx`

1. **Buscar última atividade por motorista** -- Após carregar os cartões, fazer uma query a `driver_activities` para obter o `start_time` mais recente de cada `driver_id` que tenha cartão mapeado. Guardar num `Map<driver_id, timestamp>`.

2. **Adicionar coluna "Última Inserção"** na tabela, entre "Perfil Associado" e "Validade", mostrando a data/hora formatada (ex: "14/02 às 08:32") ou "—" se não houver dados.

3. **Interface `TachCard`** -- Sem alteração na interface (os dados vêm de uma query separada).

## Detalhes técnicos

- Query: `SELECT DISTINCT ON (driver_id) driver_id, start_time FROM driver_activities ORDER BY driver_id, start_time DESC` para obter a atividade mais recente de cada motorista.
- Formato da hora: `dd/MM HH:mm` usando `date-fns` com locale `pt`.
- Apenas mostrar para cartões com `driver_id` mapeado.
