

# Fix: Backfill driver_name nos card_events existentes + verificar estado do cartão

## Situação atual

1. **A tabela `tachograph_cards`** já tem `driver_name = 'JOAO JOSE ANASTACIO ROSEIRO'` (fix anterior aplicado com sucesso)
2. **A tabela `employees`** já tem `card_number = '0000001236405002'` (normalizado, sem prefixo `5B.`)
3. **O código `resolveDriverInfo`** já tem o fallback via `cardToEmployee` (fix anterior aplicado)
4. **Mas todos os 6 card_events existentes** para este cartão têm `driver_name: NULL` e `employee_number: NULL` — foram criados antes do fix
5. **A API Trackit às 10:57** ainda mostra `dc1: "0000001236405002"` com `ds1: 2` (trabalho) e `card_present: true` — o sistema ainda não detetou remoção porque a API diz que o cartão está lá

## O que fazer

### 1. Backfill dos card_events existentes (migração SQL)

Atualizar todos os `card_events` com `card_number = '0000001236405002'` que têm `driver_name IS NULL`:

```sql
UPDATE card_events 
SET driver_name = 'JOAO JOSE ANASTACIO ROSEIRO',
    employee_number = 7335
WHERE card_number = '0000001236405002' 
  AND driver_name IS NULL;
```

### 2. Backfill genérico para outros cartões afetados

Fazer um UPDATE cruzado com a tabela `tachograph_cards` e `employees` para preencher `driver_name` e `employee_number` em todos os `card_events` que tenham estes campos a NULL mas tenham `card_number` preenchido:

```sql
UPDATE card_events ce
SET driver_name = tc.driver_name
FROM tachograph_cards tc
WHERE ce.card_number = tc.card_number
  AND ce.driver_name IS NULL
  AND tc.driver_name IS NOT NULL;

UPDATE card_events ce
SET employee_number = e.employee_number
FROM employees e
WHERE ce.employee_number IS NULL
  AND ce.driver_name IS NOT NULL
  AND LOWER(TRIM(ce.driver_name)) = LOWER(TRIM(e.full_name));
```

### 3. Sobre a remoção do cartão

A API Trackit (última leitura às 10:57 UTC) **ainda mostra o cartão inserido** com `ds1=2` (trabalho). O sistema só vai registar a remoção quando a API deixar de reportar o cartão. Isto acontecerá automaticamente na próxima sincronização após a API atualizar.

Se o motorista diz que já retirou, pode ser atraso na propagação da API Trackit (normal, pode levar até 10-15 minutos).

## Resultado

- Os 6 eventos existentes passam a mostrar "JOAO JOSE ANASTACIO ROSEIRO" e "7335" no histórico
- Qualquer outro card_event com driver_name em falta será também corrigido
- Novos eventos já serão criados com o nome correto (fix anterior)
- A remoção será registada automaticamente quando a API atualizar

