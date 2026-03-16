

# Notificar admins quando motorista renova documento

## Abordagem

Após a renovação bem-sucedida no `handleRenew`, chamar a edge function `send-fcm` para enviar push a todos os admins/managers. O padrão já existe no projeto (ex: `check-document-expiry`, `check-maintenance-alerts`).

## Implementação

### 1. Modificar `handleRenew` em `DriverDocuments.tsx`

Após o update com sucesso (linha 183-186), adicionar:

1. Buscar todos os admin/manager IDs via `user_roles` (role in admin, manager)
2. Para cada um, invocar `send-fcm` com:
   - `title`: "📄 Documento Renovado"
   - `body`: "{nome do motorista} renovou {tipo do doc} - {matrícula}"
   - `data.route`: "/admin/fleet"
3. Usar `supabase.functions.invoke("send-fcm", ...)` (padrão frontend)

### 2. Obter dados para a mensagem

- Nome do motorista: disponível via `useAuth()` → `profile.full_name`
- Matrícula: já em `vehiclePlate` state
- Tipo do documento: `docTypeLabels[renewDoc.doc_type]`

### Código resumido

```typescript
// After successful renew, notify admins
const { data: staffRoles } = await supabase
  .from("user_roles")
  .select("user_id")
  .in("role", ["admin", "manager"]);

if (staffRoles?.length) {
  const docLabel = docTypeLabels[renewDoc.doc_type] || renewDoc.doc_type;
  const driverName = profile?.full_name || "Motorista";
  
  for (const staff of staffRoles) {
    supabase.functions.invoke("send-fcm", {
      body: {
        user_id: staff.user_id,
        title: "📄 Documento Renovado",
        body: `${driverName} renovou ${docLabel} - ${vehiclePlate}`,
        data: { route: "/admin/fleet" },
      },
    });
  }
}
```

Sem alterações à base de dados -- usa apenas a infraestrutura de push existente.

