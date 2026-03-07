

# Suporte para Reboques (L-*) na Importação e Grelha de Manutenção

## Problema

A importação do Excel não reconhece as matrículas de reboques (ex: L-184230, L-182821) porque:
1. A função `looksLikePlate` só aceita padrões de matrícula portugueses (00-AA-00 ou AA-00-AA), rejeitando o formato L-NNNNNN
2. Mesmo que sejam detetadas, não existem registos na tabela `trailers` — o import só grava dados para matrículas que já existem na BD
3. A linha "MANUTENÇÕES REBOQUES" no Excel é ignorada (está no SKIP_ROWS) mas contém datas de manutenção específicas dos reboques

## Solução

**Ficheiro**: `src/components/admin/MaintenanceImportExport.tsx`

### 1. Reconhecer matrículas de reboques
Atualizar `looksLikePlate` para aceitar o padrão `L-NNNNNN` (e variações como `L-NNNNN`):
```typescript
function looksLikePlate(val: string): boolean {
  const clean = val.trim().toUpperCase().replace(/\s+/g, "");
  // Trailer plates: L-NNNNNN
  if (/^L-?\d{4,6}$/.test(clean)) return true;
  // Standard Portuguese plates
  return PLATE_REGEX.test(clean) || ...;
}
```

### 2. Mapear "MANUTENÇÕES REBOQUES" como categoria
Remover "MANUTENÇÕES REBOQUES" do `SKIP_ROWS` e adicioná-la ao `TRANSPOSED_ROW_MAP` como uma nova categoria ou mapeamento para manutenção geral de reboques. Adicionar à constante `CATEGORIES` na grelha.

### 3. Auto-criar reboques durante a importação
No `handleImport`, para matrículas não encontradas que correspondam ao padrão L-*, criar automaticamente um registo na tabela `trailers` e usar o novo ID para gravar os dados de manutenção:
```typescript
// Para cada unmatched row com placa L-*
if (!row.vehicleId && plate.match(/^L-?\d+$/i)) {
  const { data } = await supabase.from("trailers")
    .insert({ plate }).select("id").single();
  row.vehicleId = data.id;
  row.hasMatch = true;
}
```

### 4. Adicionar categoria "Manutenção Reboques" à grelha

**Ficheiro**: `src/pages/admin/Maintenance.tsx`

Adicionar entrada no array `CATEGORIES`:
```typescript
{ key: "Manutenção Reboques", label: "Manut. Reboques", icon: Wrench, short: "Reboques" }
```

## Ficheiros a editar
- `src/components/admin/MaintenanceImportExport.tsx` — reconhecimento de placas L-*, mapeamento da categoria, auto-criação de reboques
- `src/pages/admin/Maintenance.tsx` — nova categoria na grelha

