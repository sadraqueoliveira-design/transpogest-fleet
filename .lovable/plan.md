

# Mostrar Número Móvel na Página de Frota

O número móvel não aparece porque a página Fleet.tsx tem os seus próprios cards (não usa o VehicleCard.tsx). Vou adicionar o número móvel em **dois sítios**:

## 1. Cards Mobile (linhas 342-347)
Adicionar o número móvel ao lado da matrícula no header do card:
```
42-HX-81 · 📞 1080
```

## 2. Tabela Desktop (linhas 403, 456)
Adicionar coluna "Nº Móvel" ao lado da coluna "Matrícula" no header e nas células (incluindo modo edição).

## Ficheiro
`src/pages/admin/Fleet.tsx`

- Importar `Phone` do lucide-react
- Header tabela: adicionar `<TableHead>Nº Móvel</TableHead>` após Matrícula
- Célula tabela (modo normal): mostrar `v.mobile_number || "—"`
- Célula tabela (modo edição): input para editar mobile_number
- Card mobile: mostrar número ao lado da matrícula
- Atualizar colSpan de 10 para 11

