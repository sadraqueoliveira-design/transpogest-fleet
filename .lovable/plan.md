

## Corrigir timestamp de inserção quando o cartão muda (motoristas diferentes)

### Problema
O veículo 97-LF-48 teve 3 motoristas hoje. O sistema compara apenas `oldHasCard` vs `newHasCard` (boolean). Quando ambos sao `true`, preserva o `card_inserted_at` antigo (linha 404-406), sem verificar se o numero do cartao mudou. Resultado: a hora mostrada e do primeiro motorista, nao do atual (Jorge).

### Solucao

**Ficheiro: `supabase/functions/sync-trackit-data/index.ts`**

Na logica de tracking de cartao (linhas 366-412), alem de comparar presenca, comparar tambem o **numero do cartao**:

1. Extrair `oldCardNumber` do `tachograph_status` existente (campo `card_slot_1` ou fallback `dc1`)
2. Extrair `newCardNumber` do novo `tachograph_status` (campo `card_slot_1`)
3. Se ambos tem cartao MAS o numero mudou → tratar como nova insercao (adicionar a `cardEventLookups` para buscar o evento 45 real)
4. So preservar o timestamp existente quando o numero do cartao e o mesmo

### Alteracao especifica

```text
Antes (linha 404-406):
  } else if (newHasCard && existing.card_inserted_at) {
    // Card still inserted -> preserve existing timestamp
    (rec as any).card_inserted_at = existing.card_inserted_at;

Depois:
  } else if (newHasCard && existing.card_inserted_at) {
    // Check if card NUMBER changed (different driver)
    if (oldCardNumber && newCardNumber && oldCardNumber !== newCardNumber) {
      // Different card inserted -> need new event timestamp
      cardEventLookups.push({ idx, vehicleMid: ..., plate: ..., isBackfill: false });
    } else {
      // Same card still inserted -> preserve existing timestamp
      (rec as any).card_inserted_at = existing.card_inserted_at;
    }
```

### Impacto
- Quando um motorista diferente insere o cartao no mesmo veiculo, o `card_inserted_at` sera atualizado com a hora real da nova insercao
- Se o mesmo cartao permanece, o comportamento nao muda
- O dashboard mostrara a hora correta do motorista atual
