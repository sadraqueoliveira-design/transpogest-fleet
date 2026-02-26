
# Plano: Mostrar data/hora real de insercao do cartao

## Problema

O campo `tmx` no JSON do tacografo e o timestamp da ultima mensagem de telemetria, nao da insercao do cartao. Por isso, o horario apresentado fica a atualizar a cada sincronizacao (~1 hora), em vez de mostrar quando o motorista efetivamente colocou o cartao.

## Solucao

Adicionar uma coluna `card_inserted_at` na tabela `vehicles` que guarda o momento exato em que o cartao foi detetado pela primeira vez. A logica de sincronizacao atualiza este campo apenas quando o estado do cartao muda.

### 1. Nova coluna na base de dados

Adicionar `card_inserted_at TIMESTAMPTZ` a tabela `vehicles` (valor default NULL).

### 2. Atualizar a funcao de sincronizacao

No ficheiro `supabase/functions/sync-trackit-data/index.ts`:

- Antes do upsert, verificar se o veiculo ja tem um cartao inserido comparando com o estado anterior
- Se `dc1` passa de vazio/null para um valor valido: definir `card_inserted_at = now()`
- Se `dc1` passa de um valor para vazio/null: limpar `card_inserted_at = null`
- Se `dc1` se mantém igual: manter o valor existente (nao atualizar)

Para isso, buscar os veiculos existentes antes do upsert para comparar o estado do cartao anterior com o novo.

### 3. Atualizar o Dashboard

No ficheiro `src/pages/admin/Dashboard.tsx`:

- Usar `v.card_inserted_at` em vez de `tacho.tmx` para mostrar o horario na linha "Cartao"
- A condicao fica: `driverCard && v.card_inserted_at`
- O formato continua `dd/MM HH:mm`

## Ficheiros a modificar

| Ficheiro | Acao |
|---|---|
| Base de dados (vehicles) | Adicionar coluna `card_inserted_at` |
| `supabase/functions/sync-trackit-data/index.ts` | Logica para detetar mudanca de cartao e atualizar timestamp |
| `src/pages/admin/Dashboard.tsx` | Usar `card_inserted_at` em vez de `tmx` |

## Resultado esperado

- Quando um motorista insere o cartao, aparece a data/hora exata desse momento
- O horario NAO muda ate o motorista retirar e voltar a inserir o cartao
- Veiculos sem cartao continuam a mostrar o badge vermelho "Sem Cartao"
