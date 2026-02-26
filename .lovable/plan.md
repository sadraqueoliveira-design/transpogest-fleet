
# Plano: Promover Filipes a Admin + Emails de Motoristas + Recuperacao de Senha

## 1. Alterar roles dos 2 Filipe Oliveira para admin

Atualizar na base de dados o role de ambos os perfis:
- **Filipe Duarte Da Luz De Oliveira** (ID: `a318a9b6-...`) de `driver` para `admin`
- **Filipe Oliveira** (ID: `04734c17-...`) de `driver` para `admin`

Usando UPDATE direto na tabela `user_roles`.

---

## 2. Mostrar emails de cadastro dos motoristas

Adicionar na pagina de Motoristas (`src/pages/admin/Drivers.tsx`) uma coluna ou indicador que mostra o email associado ao perfil de cada funcionario que ja tem conta (ou seja, que tem `profile_id` preenchido).

- Fazer JOIN entre `employees` e `profiles` para obter o email
- Nota: O email nao esta na tabela `profiles`, esta em `auth.users` que nao e acessivel pelo cliente
- **Solucao**: Buscar os profiles associados e mostrar na tabela se o funcionario tem conta ativa ou nao. Para mostrar o email, sera necessario guardar o email na tabela profiles OU criar uma edge function que, como admin, lista os emails dos users.

**Abordagem escolhida**: Criar uma edge function `list-user-emails` que, sendo chamada por admin, retorna o mapeamento `user_id -> email` usando `supabase.auth.admin.listUsers()`. Depois mostrar o email na tabela de motoristas.

---

## 3. Implementar recuperacao de senha

Atualmente nao existe nenhum fluxo de "Esqueci a senha". Precisa de:

### a) Botao "Esqueceu a senha?" na pagina de Login (`src/pages/Auth.tsx`)
- Adicionar link/botao abaixo do formulario de login
- Abre um dialog ou navega para um estado que pede apenas o email
- Chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`
- Mostra mensagem de sucesso

### b) Nova pagina `/reset-password` (`src/pages/ResetPassword.tsx`)
- Rota publica (nao protegida)
- Verifica o hash da URL para `type=recovery`
- Formulario para definir nova senha
- Chama `supabase.auth.updateUser({ password })`
- Redireciona para `/auth` apos sucesso

### c) Registar rota no App.tsx
- Adicionar `<Route path="/reset-password" element={<ResetPassword />} />`

---

## Ficheiros a criar/modificar

| Ficheiro | Acao |
|---|---|
| Base de dados (user_roles) | UPDATE role para admin nos 2 Filipes |
| `supabase/functions/list-user-emails/index.ts` | Nova edge function para listar emails |
| `src/pages/admin/Drivers.tsx` | Adicionar coluna "Email" com dados da edge function |
| `src/pages/Auth.tsx` | Adicionar botao "Esqueceu a senha?" e dialog |
| `src/pages/ResetPassword.tsx` | Nova pagina para redefinir senha |
| `src/App.tsx` | Adicionar rota `/reset-password` |
