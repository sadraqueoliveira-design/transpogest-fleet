

# Correção: Cartão do João Roseiro sem nome nos eventos

## Problema raiz

O cartão `0000001236405002` não está associado ao nome do João Roseiro porque:

1. **Tabela `tachograph_cards`**: o registo existe mas `driver_name` é `NULL`
2. **Tabela `employees`**: o `card_number` está guardado como `5B.0000001236405002` (com prefixo país)
3. **API Trackit**: devolve `0000001236405002` (sem prefixo)
4. **`sync-trackit-data`**: ao procurar o match na BD, não encontra correspondência porque os formatos diferem

## Solução (2 partes)

### 1. Normalizar o match de cartões no `sync-trackit-data`

No bloco que faz lookup do `card_number` para obter `driver_name` e `employee_number`, aplicar strip do prefixo país (ex: `5B.`, `5B,`) antes de comparar:

```typescript
// Normalizar: remover prefixo país (ex: "5B." ou "5B,")
const normalizeCard = (c: string) => c.replace(/^[A-Z]{1,3}[.,]/, '');
```

Usar esta função ao comparar `tachograph_cards.card_number` e `employees.card_number` com o valor da API.

**Ficheiro**: `supabase/functions/sync-trackit-data/index.ts` — no bloco que resolve `driver_name`/`employee_number` a partir do `card_number`.

### 2. Corrigir o registo existente na tabela `tachograph_cards`

Atualizar o `driver_name` do cartão `0000001236405002` para "JOAO JOSE ANASTACIO ROSEIRO" via migração SQL, e garantir que o trigger `sync_tachograph_to_employee` mantém a sincronização futura.

**Migração SQL**:
```sql
UPDATE tachograph_cards 
SET driver_name = 'JOAO JOSE ANASTACIO ROSEIRO'
WHERE card_number = '0000001236405002';
```

### Resultado esperado

- Todos os futuros `card_events` do cartão `0000001236405002` terão `driver_name` e `employee_number` preenchidos
- A página de histórico de cartões mostrará "JOAO JOSE ANASTACIO ROSEIRO" em vez de "—"
- O mesmo fix aplica-se a qualquer outro cartão com prefixo país na tabela de employees

