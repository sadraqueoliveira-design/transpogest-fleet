

# Reboques sem dados — Necessário reimportar Excel

## Diagnóstico

A base de dados está vazia para reboques:
- Tabela `trailers`: **0 registos**
- Categoria "Manutenção Reboques" em `vehicle_maintenance_schedule`: **0 registos**

O código de importação já foi atualizado para:
1. Reconhecer matrículas L-NNNNNN
2. Mapear a linha "MANUTENÇÕES REBOQUES" do Excel como categoria válida
3. Auto-criar reboques na tabela `trailers` durante a importação

**Mas o ficheiro Excel ainda não foi reimportado** desde essas alterações. Os dados simplesmente não existem na base de dados.

## O que acontece na linha "MANUTENÇÕES REBOQUES" do Excel

Essa linha contém **datas** associadas a cada **veículo** (não a matrículas L- separadas). Quando o Excel for reimportado, cada veículo receberá um registo na categoria "Manutenção Reboques" com a data correspondente.

As matrículas L- (se existirem numa linha "MATRICULAS" separada no Excel) serão auto-criadas na tabela `trailers` e também receberão os seus registos de manutenção.

## Solução

Não é necessário alterar código. O utilizador precisa de:

1. **Reimportar o ficheiro Excel de manutenções** na página de Manutenção (botão "Importar")
2. Os dados de "MANUTENÇÕES REBOQUES" serão automaticamente importados como nova categoria
3. As matrículas L- serão auto-criadas na tabela `trailers`

Se o "Móvel" (número interno) dos reboques também existir no Excel, atualmente a linha "MOVEL" está a ser ignorada (`SKIP_ROWS`). Posso alterar o código para capturar o valor "MOVEL" e usá-lo como `mobile_number` dos veículos e `internal_id` dos reboques durante a importação.

## Alteração proposta

**Ficheiro**: `src/components/admin/MaintenanceImportExport.tsx`

1. Remover `"MOVEL"` do `SKIP_ROWS`
2. Capturar a linha "MOVEL" durante o parsing (tal como se faz com "MOTORISTA")
3. Ao importar, atualizar o campo `mobile_number` nos veículos e `internal_id` nos trailers com o valor correspondente da coluna

Isto garante que, após reimportação, a coluna "Móvel" na grelha mostra os valores correctos para veículos e reboques.

