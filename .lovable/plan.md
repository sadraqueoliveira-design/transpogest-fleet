

# Corrigir deteção de re-inserção do mesmo cartão

## Problema

Quando o mesmo motorista remove e re-insere o mesmo cartão (ex: fim do turno e início do turno seguinte), o sistema não deteta a mudança porque a lógica atual (linhas 513-516) apenas compara o número do cartão:

```
Se oldCardNumber === newCardNumber → preservar timestamp antigo
```

Resultado: o 42-HX-75 mostra "Cartão 02/03, 05:20" quando na realidade o Manuel retirou o cartão, e voltou a inserir hoje ~04:20h. Como o número do cartão não mudou entre syncs, o sistema nunca consulta os eventos 45/46.

## Solução

No ficheiro `supabase/functions/sync-trackit-data/index.ts`, alterar o bloco "same card still inserted" (linhas 513-516) para também consultar eventos quando o cartão está inserido há mais de **12 horas**:

### Lógica atual (linha 513-516):
```
Se mesmo cartão → preservar card_inserted_at existente
```

### Lógica corrigida:
```
Se mesmo cartão E card_inserted_at < 12h atrás → preservar (sem custo de API)
Se mesmo cartão E card_inserted_at >= 12h atrás → consultar eventos 45/46
  → Se encontra evento 46 (removal) seguido de 45 (insertion) mais recente
    que o card_inserted_at atual → atualizar timestamp e criar eventos
  → Se não encontra nada novo → preservar timestamp existente
```

Isto garante que:
- Sessões curtas (< 12h) não fazem chamadas extra à API
- Sessões longas (>= 12h, típico de remoção noturna + re-inserção matinal) verificam se houve remoção+re-inserção
- O histórico de card_events regista corretamente a sessão real

### Alteração concreta

1. No bloco `else if (newHasCard && existing.card_inserted_at)` com `oldCardNumber === newCardNumber`, verificar a idade do `card_inserted_at`
2. Se >= 12h, adicionar a `cardEventLookups` com eventType `"recheck"` 
3. No processamento dos resultados, tratar `"recheck"`: se encontra evento 45 mais recente que o `card_inserted_at` atual, atualizar o timestamp e criar eventos de remoção + inserção

## Impacto

- 42-HX-75 passaria a mostrar a inserção real de hoje (~04:20h) em vez de 02/03
- Todos os veículos onde o mesmo motorista re-insere o cartão diariamente serão corrigidos
- Custo: chamadas extra à API Trackit apenas para veículos com sessões > 12h (tipicamente poucos por sync)

