

## Mapeamento Automatico de Cartoes de Tacografo

### Problema
Existem 43 cartoes de tacografo com `driver_name` preenchido e correspondencia na tabela `employees`, mas sem `driver_id` (sem conta de utilizador). Sem conta vinculada, o sistema nao consegue:
- Mostrar o nome do motorista no dashboard
- Atribuir o `current_driver_id` ao veiculo
- Registar eventos de cartao com motorista identificado

### Solucao

Executar a funcao `map-tacho-cards` em dois passos:

1. **Dry run** -- simular o mapeamento para verificar quantos cartoes serao mapeados, quantas contas serao criadas e se ha erros previstos. Apresentar os resultados ao utilizador.

2. **Execucao real** (`dry_run: false`) -- criar as contas de utilizador para os motoristas sem perfil, mapear o `driver_id` nos cartoes e vincular o `profile_id` nos employees. O trigger `handle_new_user` cria automaticamente o perfil e associa ao employee por nome ou NIF.

### O que acontece apos a execucao

- No proximo ciclo de sincronizacao (5 min), os veiculos com estes cartoes inseridos terao o `current_driver_id` resolvido
- Os nomes dos motoristas aparecerao no dashboard, no mapa e no historico de cartoes
- Os eventos de cartao futuros serao registados com o motorista correto

### Detalhes tecnicos

- A funcao `map-tacho-cards` ja existe em `supabase/functions/map-tacho-cards/index.ts`
- Cria contas com email no formato `nif@fleet.local` (se o employee tiver NIF) ou `primeiro.ultimo@fleet.local`
- Password temporaria definida no secret `ADMIN_TEMP_PASSWORD`
- O trigger `handle_new_user` propaga automaticamente os dados do employee para o perfil
- Se o email ja existir, tenta com sufixo dos ultimos 4 digitos do cartao

