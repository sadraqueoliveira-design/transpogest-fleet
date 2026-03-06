

# Alertas para motoristas + limiar configurável + importação nativa do Mapa de Manutenções

## 1. Alertas push para motoristas

A edge function `check-maintenance-alerts` atualmente notifica apenas admins/managers. Será atualizada para:
- Consultar `vehicles.current_driver_id` para cada veículo com manutenção a expirar
- Enviar push individual ao motorista com mensagem personalizada (ex: "🔧 O seu veículo 73-DH-27 tem IPO a expirar em 5 dias")
- Manter a notificação consolidada para admins/managers
- Rota de redirecionamento: `/driver` para motoristas

**Ficheiro**: `supabase/functions/check-maintenance-alerts/index.ts`

## 2. Limiar configurável na página de manutenção

- Guardar o limiar na tabela `app_config` com a key `maintenance_alert_days` (valor por defeito: 15)
- Adicionar um pequeno controlo na UI do Planeamento (dropdown ou input numérico) para o admin escolher 7, 15, 30 ou 60 dias
- A edge function lê este valor da `app_config` em vez de usar 15 fixo
- Atualizar o cron job para passar este valor (ou a function lê diretamente da BD)

**Ficheiros**:
- `src/pages/admin/Maintenance.tsx` (adicionar UI de configuração do limiar)
- `supabase/functions/check-maintenance-alerts/index.ts` (ler limiar da BD)
- SQL: inserir valor default em `app_config`

## 3. Reconhecimento automático do formato "Mapa de Manutenções" (.xlsm)

O ficheiro original tem um formato **transposto** (viaturas nas colunas, categorias nas linhas). Os cabeçalhos de linha são:
- `MATRICULAS` → linha de matrículas
- `DATA PROXIMA REVISÃO (X)` → Revisão KM data
- `PROXIMA REVISÃO ( X )` → Revisão KM km
- `REVISÃO ANUAL ( Y )` → Revisão Anual
- `I.P.O DATA` → IPO
- `REVISÃO DE FRIO` → Revisão Frio
- `HORAS PROXIMA REVISÃO` → Revisão Horas
- `TACOGRAFO` → Tacógrafo
- `A.T.P.` → ATP
- `LAVAGENS` → Lavagem

A lógica de importação será atualizada para:
1. Detetar automaticamente se o ficheiro está no formato "Mapa de Manutenções" (transposto) verificando se a primeira coluna contém estes cabeçalhos de linha
2. Se sim, transpor os dados internamente: extrair matrículas da linha `MATRICULAS` e mapear cada linha de categoria aos valores por coluna
3. Filtrar viaturas L-* (reboques) automaticamente
4. Ignorar linhas auxiliares como `DIAS FALTA`, `HORAS ATUAIS`, `ATUALIZAÇÃO KM,S`, etc.
5. Tratar `*******` como valor vazio
6. Continuar para o fluxo normal de preview + seleção de categorias

**Ficheiro**: `src/components/admin/MaintenanceImportExport.tsx`

## Resumo de alterações

| Ficheiro | Ação |
|---|---|
| `supabase/functions/check-maintenance-alerts/index.ts` | Editar: adicionar notificações a motoristas + ler limiar da BD |
| `src/pages/admin/Maintenance.tsx` | Editar: adicionar selector de limiar de dias |
| `src/components/admin/MaintenanceImportExport.tsx` | Editar: deteção automática do formato transposto |
| SQL (app_config) | Inserir `maintenance_alert_days = 15` |

