

# Alertas automáticos de manutenção a expirar (< 15 dias)

## Resumo
Criar uma Edge Function `check-maintenance-alerts` que corre diariamente e envia notificações push para admins/managers quando uma manutenção está a menos de 15 dias de expirar.

## Implementação

### 1. Edge Function `check-maintenance-alerts`
- Consulta `vehicle_maintenance_schedule` onde `next_due_date` está entre hoje e hoje+15 dias
- Faz JOIN com `vehicles` para obter a matrícula
- Agrupa os alertas por severidade: **Expirado** (< hoje), **Crítico** (< 7 dias), **Urgente** (< 15 dias)
- Obtém todos os admin/manager da tabela `user_roles`
- Envia notificação push via `send-fcm` (chamada interna HTTP) com resumo: "⚠️ 3 manutenções expiradas, 5 urgentes"
- Regista na `push_notifications_log`

### 2. Cron job diário
- Agendar via `pg_cron` para correr às 07:00 todos os dias (antes do morning-digest das 08:00)
- `0 7 * * *`

### 3. Config
- Adicionar `[functions.check-maintenance-alerts] verify_jwt = false` ao `config.toml`

### Detalhes técnicos
- A função usa `SUPABASE_SERVICE_ROLE_KEY` para ler dados e `FIREBASE_SERVICE_ACCOUNT` para envio push (ambos já configurados)
- Reutiliza o padrão FCM existente em `send-fcm`
- Notifica apenas admins e managers (não motoristas) com link para `/admin/manutencao`
- Evita spam: agrupa tudo num único push por utilizador com contagem total

### Ficheiros
- **Criar**: `supabase/functions/check-maintenance-alerts/index.ts`
- **Editar**: `supabase/config.toml` (adicionar entrada)
- **SQL** (insert tool): cron job via `cron.schedule()`

