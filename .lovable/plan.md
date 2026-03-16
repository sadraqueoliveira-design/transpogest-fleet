

# Remover ícone Phone do número móvel na Frota

## Alterações em `src/pages/admin/Fleet.tsx`

1. **Card mobile (linha 350)**: Remover `<Phone className="h-3 w-3" />`, manter apenas o texto `· {v.mobile_number}`
2. **Tabela desktop (linha 468)**: Remover `<Phone className="h-3 w-3 text-muted-foreground" />`, mostrar apenas `v.mobile_number`
3. Remover `Phone` da importação do lucide-react (se não for usado noutro sítio do ficheiro)

