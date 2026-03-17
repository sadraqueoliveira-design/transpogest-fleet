

# Migrar TranspoGest para Vercel + Supabase Externo

## Contexto

Este projeto usa Lovable Cloud (Supabase gerido). Para migrar para Vercel + Supabase externo, precisas de:

1. **Repositório GitHub** (já tens se conectaste o GitHub ao Lovable)
2. **Projeto Supabase externo** (criar em supabase.com)
3. **Conta Vercel** (conectar ao mesmo repositório)

---

## Passo a passo

### 1. Exportar a base de dados

- Abre o **Cloud View** no Lovable (Settings > Backend)
- Vai a **Run SQL** e exporta os dados que precisas (ou usa `pg_dump` se tiveres acesso direto)
- Alternativamente, recria as tabelas no novo Supabase usando as migrações que estão em `supabase/migrations/`

### 2. Criar projeto Supabase externo

- Vai a [supabase.com](https://supabase.com) e cria um novo projeto
- Instala a CLI do Supabase localmente: `npm install -g supabase`
- No repositório clonado, corre:
  ```bash
  supabase link --project-ref <NEW_PROJECT_ID>
  supabase db push        # aplica todas as migrações
  supabase functions deploy  # faz deploy das edge functions
  ```
- Configura os **secrets** nas Edge Functions do novo projeto (via dashboard ou CLI):
  - `TRACKIT_USERNAME`, `TRACKIT_PASSWORD`
  - `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_VAPID_KEY`
  - `ADMIN_TEMP_PASSWORD`
  - `LOVABLE_API_KEY` (se ainda usares AI via Lovable)

### 3. Configurar Storage Buckets

No dashboard do novo Supabase, cria os buckets:
- `fuel-receipts` (público)
- `occurrence-photos` (público)
- `vehicle-docs` (público)
- `maintenance-photos` (público)
- `signatures` (público)
- `signed-declarations` (público)
- `manager-signatures` (privado)

### 4. Deploy no Vercel

- Vai a [vercel.com](https://vercel.com), importa o repositório GitHub
- Configura as **Environment Variables** no Vercel:
  ```
  VITE_SUPABASE_URL=https://<NEW_PROJECT_ID>.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=<nova_anon_key>
  VITE_SUPABASE_PROJECT_ID=<NEW_PROJECT_ID>
  ```
- O Vercel deteta automaticamente o Vite e usa `npm run build` / `bun run build`
- Framework preset: **Vite**
- Output directory: `dist`

### 5. Configurar Auth no Supabase

No dashboard do novo Supabase:
- **Authentication > URL Configuration**: adiciona o domínio Vercel (ex: `https://teu-app.vercel.app`) como **Site URL** e nos **Redirect URLs**
- Configura email templates se necessário

### 6. Domínio personalizado (opcional)

- No Vercel, adiciona o teu domínio customizado
- Atualiza o Site URL e Redirect URLs no Supabase

---

## Resumo de ferramentas

| Tarefa | Ferramenta |
|---|---|
| Migrações DB | `supabase db push` |
| Edge Functions | `supabase functions deploy` |
| Secrets | Dashboard Supabase ou `supabase secrets set` |
| Frontend | Vercel (auto-deploy via GitHub) |
| Auth redirects | Dashboard Supabase |

---

## Nota importante

O ficheiro `.env` local **não** é commitado (está no `.gitignore`). As variáveis de ambiente devem ser configuradas diretamente no painel do Vercel. O código não precisa de alterações — apenas as variáveis de ambiente mudam.

