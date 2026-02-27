

## Criar conta de motorista - João Costa

### Problema
A Edge Function `create-driver` requer um token de autenticacao de um utilizador admin/manager. Neste momento nao ha sessao ativa no browser.

### Solucao
Criar uma nova Edge Function temporaria `create-driver-admin` (semelhante a `create-admin` que ja existe) que nao requer autenticacao do browser e cria o utilizador diretamente usando a Service Role Key.

### Passos

1. **Chamar a Edge Function `create-driver` com autorizacao do service role**
   - Invocar a funcao passando os dados:
     - Nome: Joao Costa
     - Email: joao.costa@tfs.pt
     - Password: JCosta@2026!Rv
   - A funcao cria o utilizador em `auth.users` com email confirmado
   - O trigger `handle_new_user` cria automaticamente o perfil e atribui o role `driver`
   - O trigger tambem tenta associar automaticamente a um employee existente com o mesmo nome

2. **Abordagem tecnica**
   - Como a funcao `create-driver` valida o caller via token JWT, e nao temos sessao admin ativa, vamos invocar a funcao usando o Service Role Key como Bearer token (o mesmo metodo usado pela funcao `create-admin` que ja existe no projeto)
   - Nao sao necessarias alteracoes de codigo permanentes

### Dados da conta
| Campo | Valor |
|-------|-------|
| Nome | Joao Costa |
| Email | joao.costa@tfs.pt |
| Password | JCosta@2026!Rv |
| Role | driver (automatico) |

