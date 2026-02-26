

# Corrigir timestamp de insercao do cartao - usar eventos Trackit

## Problema

O campo `drs.tmx` da API Trackit nao e o momento da insercao do cartao -- e o timestamp da ultima mensagem de telemetria. Por isso, quando o cartao do Austelino foi inserido as ~06:00 mas a primeira sincronizacao pos-migracao ocorreu as 11:25, o sistema gravou 11:25 em vez de 06:00.

## Abordagem

A API Trackit tem um endpoint `/ws/events` que reporta eventos historicos por veiculo, incluindo possivelmente eventos de insercao/remocao de cartao. Podemos usar este endpoint para obter o timestamp real.

### Passo 1: Investigar eventos de insercao de cartao

Criar uma edge function temporaria (ou adaptar a existente `trackit-events`) para consultar os eventos do veiculo AD-98-JU no dia de hoje e identificar se existe um evento de "card insertion" com o ID correto e o timestamp real (~06:00).

Os IDs de evento de insercao de cartao na Trackit sao tipicamente:
- Evento 45: "Driver Card Inserted Slot 1"
- Evento 46: "Driver Card Removed Slot 1"

### Passo 2: Integrar na sincronizacao

Se confirmarmos que o evento existe, modificar a logica de sincronizacao em `sync-trackit-data/index.ts` para:

1. No caso de **backfill** (cartao presente mas sem `card_inserted_at`), consultar o endpoint de eventos para obter o timestamp real de insercao
2. No caso de **transicao detetada** (sem cartao -> com cartao), se o `tmx` nao for preciso, consultar os eventos recentes

### Passo 3: Alternativa pragmatica

Se a API de eventos nao fornecer o timestamp de insercao, aceitar a limitacao e:
- Para transicoes futuras (sem cartao -> com cartao), o `tmx` sera razoavelmente preciso (dentro do intervalo de 5 min de sincronizacao)
- Para cartoes ja inseridos (backfill), nao ha forma fiavel de saber o horario real sem historico de eventos

## Ficheiros a modificar

| Ficheiro | Acao |
|---|---|
| `supabase/functions/sync-trackit-data/index.ts` | Melhorar logica de backfill para consultar eventos se disponivel |
| `supabase/functions/trackit-events/index.ts` | Possivelmente reutilizar para consulta interna de eventos de cartao |

## Proximo passo imediato

Antes de implementar, testar o endpoint de eventos para o veiculo AD-98-JU de hoje para confirmar se o evento de insercao de cartao (evento 45) existe e contem o timestamp correto. Se nao existir, a abordagem pragmatica sera comunicada.

## Resultado esperado

- Cartoes inseridos no futuro: timestamp preciso ao minuto (via evento ou detetado na sincronizacao seguinte)
- Backfill de cartoes ja inseridos: timestamp real se a API de eventos o fornecer

