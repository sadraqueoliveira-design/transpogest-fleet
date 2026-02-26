

# Plano: Corrigir timestamps de insercao do cartao

## Problema

Quando a coluna `card_inserted_at` foi adicionada, o primeiro backfill usou `new Date()` (hora da sincronizacao). Todos os veiculos com cartao ficaram com o mesmo timestamp `2026-02-26 11:25:25`. Agora, a logica "preservar existente" mantem esses valores errados em cada sincronizacao.

## Solucao

### 1. Limpar os timestamps errados (migracao SQL)

Executar uma migracao que define `card_inserted_at = NULL` em todos os veiculos. Na proxima sincronizacao, a logica de backfill (`newHasCard && !existing.card_inserted_at`) ira disparar e usar o `tmx` da telemetria em vez de `new Date()`.

```sql
UPDATE vehicles SET card_inserted_at = NULL;
```

### 2. Disparar sincronizacao

Apos a migracao, invocar a edge function `sync-trackit-data` para que o backfill preencha `card_inserted_at` com o timestamp correto da telemetria (`drs.tmx` ou `pos.tmx`).

### 3. Verificar resultados

Consultar a tabela `vehicles` para confirmar que os timestamps sao diferentes entre veiculos e correspondem aos valores `tmx` do JSON do tacografo.

## Ficheiros a modificar

| Acao | Detalhe |
|---|---|
| Migracao SQL | `UPDATE vehicles SET card_inserted_at = NULL` |
| Nenhum ficheiro de codigo | A logica da edge function e do Dashboard ja estao corretas |

## Resultado esperado

- Cada veiculo com cartao mostra o timestamp da telemetria (quando o tacografo reportou o cartao)
- Veiculos diferentes mostram horarios diferentes
- O horario deixa de mudar a cada sincronizacao

