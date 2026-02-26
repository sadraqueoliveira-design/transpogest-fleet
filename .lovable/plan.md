

## Mostrar hora de inserção do cartão no fuso horário de Lisboa

### Problema
A hora de inserção do cartão (`card_inserted_at`) é guardada em UTC na base de dados. O `date-fns format()` usa o fuso horário do browser do utilizador, que pode não ser sempre Lisboa.

### Solução
No ficheiro `src/pages/admin/Dashboard.tsx`, linha 752, substituir o `format(new Date(...))` por uma formatação explícita com `timeZone: 'Europe/Lisbon'` usando a API nativa `toLocaleString`:

```typescript
// Antes:
format(new Date((v as any).card_inserted_at), "dd/MM HH:mm", { locale: pt })

// Depois:
new Date((v as any).card_inserted_at).toLocaleString("pt-PT", {
  timeZone: "Europe/Lisbon",
  day: "2-digit", month: "2-digit",
  hour: "2-digit", minute: "2-digit"
})
```

### Impacto
- A hora do cartão será sempre mostrada no fuso horário de Lisboa (WET/WEST), independentemente do fuso horário do browser
- Sem dependências adicionais (usa API nativa do browser)
- Formato mantém-se igual: `dd/MM HH:mm`

