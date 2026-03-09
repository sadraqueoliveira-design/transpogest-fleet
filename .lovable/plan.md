

# CRUD de Veículos na página de Manutenção

## Contexto
A tab "Reboques" já tem CRUD completo (adicionar, editar, excluir). O utilizador quer o mesmo para **veículos** — poder adicionar, editar e excluir veículos com matrícula, ID interno (Móvel), cliente e estado.

## Alterações necessárias

### 1. Migração: adicionar coluna `status` à tabela `vehicles`
A tabela `vehicles` não tem coluna `status`. Adicionar:
```sql
ALTER TABLE public.vehicles ADD COLUMN status text NOT NULL DEFAULT 'active';
```
Valores: `active`, `inactive`, `maintenance`.

### 2. Adicionar tab "Veículos" na página de Manutenção (`Maintenance.tsx`)

Criar uma nova tab "Veículos" (ao lado de "Reboques") com:
- Tabela listando: Matrícula, Móvel, Cliente, Estado, Ações (Editar/Excluir)
- Botão "Adicionar Veículo"
- Dialog de criação/edição com campos: Matrícula, ID Interno (Móvel), Cliente (dropdown), Estado (dropdown: Ativo/Inativo/Em manutenção)
- AlertDialog de confirmação para exclusão (apaga também registos de manutenção associados)

### 3. Estado para gestão do CRUD de veículos

Reutilizar o mesmo padrão do trailer CRUD:
- `vehicleDialog` (mode: add/edit)
- `vehiclePlate`, `vehicleMobile`, `vehicleClientId`, `vehicleStatus`
- `deleteVehicleId`
- Funções `handleSaveVehicle`, `handleDeleteVehicle`

### Ficheiros alterados
- **Migração SQL** — adicionar `status` a `vehicles`
- `src/pages/admin/Maintenance.tsx` — nova tab "Veículos" com CRUD completo

