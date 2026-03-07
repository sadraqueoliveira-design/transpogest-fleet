

# Filtro por categoria, coluna Reboque e Nº Funcionário visível

## Problemas identificados

1. **Falta filtro dropdown por categoria** — não existe forma de filtrar a grelha por uma categoria específica (ex: só IPO, só Lavagem)
2. **Falta indicação visual de reboque** — os reboques (L-*) aparecem na grelha mas não se distinguem dos veículos
3. **Nº Funcionário na Lavagem não aparece** — o código usa `(schedule as any).performed_by_employee` mas o tipo `ScheduleRow` não inclui esse campo; a query `select("*")` devolve-o mas o tipo é truncado

## Alterações

### `src/pages/admin/Maintenance.tsx`

1. **Adicionar `performed_by_employee` ao tipo `ScheduleRow`** (linha 30-39) — incluir `performed_by_employee: string | null`

2. **Adicionar estado `categoryFilter`** — novo `useState<string>("all")` para filtrar por categoria

3. **Adicionar dropdown de categoria** — junto à barra de pesquisa, um `Select` com "Todas as categorias" + as 8 categorias. Quando selecionado, filtra `filteredVehicles` para mostrar apenas veículos que tenham registo nessa categoria (ou todos se "all")

4. **Coluna "Tipo"** — adicionar uma coluna entre "Matrícula" e "Móvel" que mostra "Reboque" para `is_trailer === true` e "Veículo" para os restantes, com badge visual distinto

5. **Remover casts `as any`** para `performed_by_employee` — agora que o tipo inclui o campo, usar diretamente `schedule.performed_by_employee`

### Resultado esperado
- Dropdown permite filtrar grelha por categoria
- Reboques têm badge "Reboque" visível
- Nº Funcionário aparece na célula de Lavagem como "Func. 123"

