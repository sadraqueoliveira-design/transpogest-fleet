

# Alerta automático: Veículo em movimento sem cartão de tacógrafo

## Contexto

O veículo 23-IS-70 está a circular a 84 km/h sem cartão de tacógrafo inserido (`card_present: false`, `ds1: 7`). Não existe motorista atribuído nem card_events para este veículo. Atualmente o sistema mostra "Sem Cartão" mas não gera nenhum alerta nem violação de compliance.

## Proposta

### 1. Deteção automática no sync-trackit-data

Adicionar lógica na edge function `sync-trackit-data` que, após atualizar cada veículo:
- Se `speed > 5` e `card_present === false` → inserir uma `compliance_violation` do tipo `driving_without_card` com severidade `critical`
- Incluir detalhes: matrícula, velocidade, localização GPS, timestamp
- Usar deduplicação: só criar uma violação por veículo por período de 4 horas (evitar spam)

### 2. Notificação push ao admin (opcional)

Chamar a edge function `send-fcm` para notificar admins quando a violação é criada, com mensagem tipo: "⚠️ 23-IS-70 em movimento sem cartão de tacógrafo (84 km/h)"

### 3. Destaque visual no VehicleCard

No componente `VehicleCard`, quando o veículo está em movimento (`speed > 5`) e `card_present === false`:
- Mudar o badge "Sem Cartão" para vermelho com ícone `AlertTriangle`
- Adicionar borda vermelha ao card para chamar atenção imediata

### Ficheiros a alterar
- `supabase/functions/sync-trackit-data/index.ts` — adicionar deteção de condução sem cartão
- `src/components/admin/VehicleCard.tsx` — destaque visual para alerta crítico

