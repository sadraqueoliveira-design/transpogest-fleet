

## Gestao de Contas de Motoristas

### Contexto

A planilha de funcionarios nao contem emails. O mapeamento de cartoes de tacografo precisa de contas (auth.users) para vincular `driver_id`, mas sem emails reais nao ha forma de dar acesso aos motoristas.

### Solucao em 2 partes

#### Parte 1 -- Executar o mapeamento com contas placeholder

Executar `map-tacho-cards` com `dry_run: false` para:
- Criar contas com emails `@fleet.local` (nao permitem login real)
- Vincular `driver_id` nos cartoes e `profile_id` nos employees
- Os dados passam a aparecer corretamente no dashboard, mapa e historico

#### Parte 2 -- Criar pagina de gestao de contas na area admin

Adicionar uma seccao na pagina de Motoristas (`/admin/motoristas`) com funcionalidade para:

1. **Ver estado da conta** de cada motorista:
   - Sem conta (sem profile_id)
   - Conta placeholder (`@fleet.local`)
   - Conta ativa (email real)

2. **Atualizar credenciais** -- botao por motorista para definir email real e password:
   - Chama uma nova Edge Function `update-driver-credentials`
   - Usa `supabase.auth.admin.updateUserById()` para alterar o email
   - O admin define o email real e uma password inicial
   - O motorista pode depois fazer login e alterar a password

3. **Indicador visual** -- badge no card de cada motorista mostrando:
   - "Sem conta" (cinzento)
   - "Pendente" (amarelo, tem conta @fleet.local)
   - "Ativo" (verde, tem email real)

### Fluxo do administrador

1. Mapeamento automatico cria contas placeholder (dados funcionam de imediato)
2. Quando um motorista precisa de acesso ao app:
   - Admin vai a pagina de Motoristas
   - Clica "Definir Credenciais" no motorista
   - Introduz o email real e password
   - Motorista pode fazer login

### Detalhes tecnicos

**Nova Edge Function `update-driver-credentials`:**
- Recebe `user_id`, `new_email`, `new_password`
- Valida que o caller e admin
- Usa `supabase.auth.admin.updateUserById()` para atualizar email e password
- Retorna sucesso/erro

**Alteracoes na pagina de Motoristas:**
- Buscar emails via Edge Function `list-user-emails` (ja existe)
- Adicionar dialog para editar credenciais
- Mostrar badge de estado da conta

**Nenhuma alteracao de schema necessaria** -- usa tabelas e relacoes existentes.
