

# Revisão KM com números completos + Nº funcionário na Lavagem

## Alterações

### 1. Revisão KM — mostrar KM completo
Na `ScheduleCell` (linha 157-160), o valor de KM é abreviado (`1500k km`). Será alterado para mostrar o número formatado com separador de milhar (ex: `1.500.000 km`).

**Ficheiro**: `src/pages/admin/Maintenance.tsx` — linhas 157-160

### 2. Lavagem — campo de nº de funcionário

**DB**: Adicionar coluna `performed_by_employee` (text, nullable) à tabela `vehicle_maintenance_schedule` para guardar o número/nome do funcionário que executou a lavagem.

**UI — célula**: Na `ScheduleCell`, quando a categoria é "Lavagem" e existe `notes` (ou o novo campo), mostrar o nº do funcionário abaixo da data.

**UI — dialog de edição**: Quando `editDialog.category === "Lavagem"`, adicionar um campo extra "Nº Funcionário" no dialog de edição (linha ~574-588), guardando no campo `performed_by_employee`.

### Ficheiros a alterar
| Ficheiro | Alteração |
|---|---|
| `src/pages/admin/Maintenance.tsx` | Mostrar KM completo; adicionar campo funcionário no dialog e célula de Lavagem |
| SQL migration | `ALTER TABLE vehicle_maintenance_schedule ADD COLUMN performed_by_employee text;` |

