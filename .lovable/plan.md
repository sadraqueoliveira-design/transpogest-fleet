

# Atribuir client_id aos veículos na importação de manutenção

## Contexto

- A página **Frota** já permite editar `client_id` manualmente por veículo (inline edit com dropdown de clientes)
- O problema: ao importar a planilha de manutenção, os veículos novos ou existentes não recebem `client_id` automaticamente
- O utilizador quer que, ao importar com um cliente/hub selecionado nos filtros, os veículos importados fiquem associados a esse cliente

## Plano

### 1. Passar o `clientFilter` selecionado ao `ScheduleImportDialog`

Na `Maintenance.tsx`, adicionar uma nova prop `selectedClientId` ao `ScheduleImportDialog` com o valor do `clientFilter` atual (se diferente de "all").

### 2. Atualizar `ScheduleImportDialog` para receber e usar `selectedClientId`

No `MaintenanceImportExport.tsx`:

- Adicionar prop opcional `selectedClientId?: string` ao `ImportDialogProps`
- No `handleImport`, depois de criar trailers e sincronizar MOVEL, adicionar um passo que atualiza o `client_id` dos veículos importados (que não sejam reboques) para o `selectedClientId`
- Mostrar um aviso no UI do dialog quando um cliente está pré-selecionado: "Os veículos importados serão associados ao cliente X"

### 3. Lógica de atribuição no import

```typescript
// Após sync de MOVEL, antes de processar categorias:
if (selectedClientId) {
  for (const row of validRows) {
    if (!isTrailerPlate(row.plate) && row.vehicleId) {
      await supabase.from("vehicles")
        .update({ client_id: selectedClientId })
        .eq("id", row.vehicleId);
    }
  }
}
```

### 4. Passar nome do cliente para exibição

Passar também a lista de `clients` ou o nome do cliente selecionado para mostrar no dialog de importação a indicação visual de qual cliente será associado.

### Ficheiros alterados
- `src/pages/admin/Maintenance.tsx` — passar `selectedClientId` e `clientName` ao import dialog
- `src/components/admin/MaintenanceImportExport.tsx` — receber props, mostrar aviso, atualizar `client_id` no import

