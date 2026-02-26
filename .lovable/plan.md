

## Adicionar Exportacao de Eventos de Cartao

### Objetivo
Adicionar botao de exportacao (CSV/XLSX) na pagina de historico de cartoes, reutilizando o componente `ExportButton` ja existente.

### Alteracoes

**Ficheiro: `src/pages/admin/CardHistory.tsx`**

1. Importar `ExportButton` de `@/components/admin/BulkImportExport`
2. Preparar os dados filtrados num formato legivel para exportacao (colunas: Hora, Evento, Motorista, N. Funcionario, Matricula)
3. Adicionar o `ExportButton` junto aos filtros, no cabecalho da pagina
4. Formatar as datas com fuso Europe/Lisbon na exportacao

### Detalhes tecnicos

- Reutilizar `ExportButton` que ja suporta CSV e XLSX via dropdown
- Mapear os dados filtrados (`filtered`) para um array de objetos com headers em portugues
- Usar `toLocaleString` com `timeZone: "Europe/Lisbon"` para formatar as datas na exportacao
- Nome do ficheiro: `eventos-cartao-{data}.csv/xlsx`

Apenas um ficheiro sera modificado: `src/pages/admin/CardHistory.tsx`.

