

# Corrigir deteção de remoção de cartão na sincronização Trackit

## Problema raiz

A sincronização Trackit deteta cartões inseridos corretamente, mas **não deteta remoções** para dispositivos que reportam via `tac.1.idc` em vez de `dc1`. O campo `tac.1.idc` é um valor persistente/cached — nunca limpa mesmo após a remoção física do cartão. Resultado: 192 veículos mostram cartões "inseridos" há dias/meses quando na realidade foram removidos.

Dados concretos:
- 03-QA-30: `dc1=null`, `tac.1.idc` com cartão, `ds1=0` (repouso) — cartão "inserido" desde 26/02
- 37-ST-22: mesmo padrão — `ds1=0` mas `card_present=true` desde 26/02
- Veículos com `dc1` preenchido e `ds1=2/3` (conduzindo) são legítimos

## Solução

Alterações em `supabase/functions/sync-trackit-data/index.ts`:

### 1. Não confiar em `tac.1.idc` como fonte exclusiva quando `ds1=0`
Na lógica de determinação de `hasValidCard` (linhas 164-178), quando a fonte do cartão é `tac.1.idc` (e não `dc1`) e `ds1 === 0` (repouso sem atividade), tratar como cartão ausente. A lógica seria:

```
Se card_source === "tac.1.idc" E ds1 === 0 → hasValidCard = false
```

Isto resolve o problema para ~60% dos casos (dispositivos sem `dc1`).

### 2. Consultar evento 46 (Card Removed) na API Trackit
Atualmente a sync já consulta evento 45 (Card Inserted). Adicionar consulta ao evento **46** (Card Removed Slot 1) no mesmo pedido de eventos, para detetar remoções que o polling falha. Quando um evento 46 é encontrado mais recente que o último evento 45, marcar o cartão como removido.

### 3. Adicionar limpeza de sessões obsoletas
Após o processamento, se `card_inserted_at` tem mais de **48 horas** e `ds1 === 0` e `last_speed === 0`, limpar `card_inserted_at` e criar evento de remoção automática com nota "auto-cleared (stale)".

## Impacto esperado

- Veículos com cartões genuinamente inseridos (ds1=2/3, conduzindo) não são afetados
- Veículos parados com dados cached de `tac.1.idc` passam a mostrar "Sem Cartão"
- O histórico de card_events reflete remoções reais em vez de sessões infinitas

