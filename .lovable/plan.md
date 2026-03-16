

# Mostrar Número Móvel nos Cards Mobile da Frota

## Alteração

**Ficheiro:** `src/components/admin/VehicleCard.tsx`

1. Adicionar `mobile_number?: string | null` à interface `Vehicle` (linha 29)
2. Importar ícone `Phone` do lucide-react
3. Adicionar linha com o número móvel no header do card, abaixo da marca/modelo e do reboque, visível apenas quando existe valor

Será apresentado como:
```
📱 Móvel: 1080
```

Usando o mesmo estilo discreto dos outros metadados (text-[10px], text-muted-foreground).

