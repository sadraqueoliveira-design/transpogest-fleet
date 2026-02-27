
## Desativar Conta Ficticia ao Vincular Conta Real

### Problema
Quando um funcionario importado via cliente (ex: Auchan) tem uma conta placeholder (`NIF@fleet.local`) e depois cria uma conta real com o seu email pessoal, o sistema bloqueia a vinculacao porque o employee ja tem `profile_id` apontando para a conta placeholder. Resultado: duas contas, dados duplicados nos paineis de admin.

### Solucao

#### 1. Adicionar coluna `is_active` a tabela `profiles`
- Coluna booleana, default `true`
- Permite marcar perfis placeholder como inativos sem os apagar (manter historico)

#### 2. Criar funcao RPC `link_real_account_to_employee`
Funcao de base de dados (security definer) que:
1. Recebe `p_employee_number` (integer)
2. Verifica se o employee existe
3. Se o employee ja tem `profile_id` e esse perfil tem email `@fleet.local`:
   - Marca o perfil antigo como `is_active = false`
   - Transfere `driver_id` nos `tachograph_cards` do perfil antigo para o novo
   - Transfere `current_driver_id` nos `vehicles` do perfil antigo para o novo
   - Transfere `driver_id` nos `driver_activities` do perfil antigo para o novo
   - Atualiza o `profile_id` do employee para o utilizador atual
4. Se o employee nao tem `profile_id`, faz a vinculacao normal
5. Se o employee tem `profile_id` com email real (nao placeholder), rejeita (ja associado)

#### 3. Alterar `DriverProfile.tsx` (`handleLinkEmployee`)
- Em vez de bloquear quando `emp.profile_id` existe e difere do user atual, chamar a funcao RPC `link_real_account_to_employee`
- A funcao RPC trata da logica de verificar se e placeholder e fazer a transferencia
- Manter o comportamento atual para employees sem `profile_id`

#### 4. Filtrar perfis inativos nos paineis admin
- Na pagina de Motoristas (`Drivers.tsx`), excluir employees cujo `profile_id` aponte para perfil com `is_active = false` dos contadores de contas ativas
- No dashboard e mapa, usar apenas perfis com `is_active = true` (ou `is_active IS NULL` para retrocompatibilidade)

### Detalhes tecnicos

**Migracao SQL:**
```text
-- Adicionar is_active a profiles
ALTER TABLE profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Funcao RPC
CREATE OR REPLACE FUNCTION link_real_account_to_employee(p_employee_number integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _caller_id uuid := auth.uid();
  _emp record;
  _old_email text;
  _old_profile_id uuid;
BEGIN
  -- Buscar employee
  SELECT * INTO _emp FROM employees WHERE employee_number = p_employee_number;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'employee_not_found');
  END IF;

  -- Ja vinculado ao caller
  IF _emp.profile_id = _caller_id THEN
    RETURN jsonb_build_object('status', 'already_linked');
  END IF;

  -- Se tem profile_id, verificar se e placeholder
  IF _emp.profile_id IS NOT NULL THEN
    _old_profile_id := _emp.profile_id;
    -- Buscar email via auth.users (security definer permite)
    SELECT email INTO _old_email
    FROM auth.users WHERE id = _old_profile_id;

    IF _old_email IS NULL OR NOT _old_email LIKE '%@fleet.local' THEN
      RETURN jsonb_build_object('error', 'already_linked_real');
    END IF;

    -- Transferir referencias do perfil antigo para o novo
    UPDATE tachograph_cards SET driver_id = _caller_id
      WHERE driver_id = _old_profile_id;
    UPDATE vehicles SET current_driver_id = _caller_id
      WHERE current_driver_id = _old_profile_id;
    UPDATE driver_activities SET driver_id = _caller_id
      WHERE driver_id = _old_profile_id;

    -- Desativar perfil antigo
    UPDATE profiles SET is_active = false WHERE id = _old_profile_id;
  END IF;

  -- Desvincular employee anterior do caller (se houver)
  UPDATE employees SET profile_id = NULL WHERE profile_id = _caller_id;

  -- Vincular employee ao caller
  UPDATE employees SET profile_id = _caller_id WHERE id = _emp.id;

  -- Copiar dados do employee para o perfil do caller
  UPDATE profiles SET
    full_name = _emp.full_name,
    birth_date = _emp.birth_date,
    hire_date = _emp.hire_date,
    license_number = COALESCE(_emp.license_number, (SELECT license_number FROM profiles WHERE id = _caller_id)),
    updated_at = now()
  WHERE id = _caller_id;

  RETURN jsonb_build_object(
    'status', 'linked',
    'employee_name', _emp.full_name,
    'replaced_placeholder', _old_profile_id IS NOT NULL
  );
END;
$$;
```

**Alteracao no DriverProfile.tsx:**
- Substituir a logica manual de verificacao e update por uma chamada RPC:
```text
const { data, error } = await supabase.rpc('link_real_account_to_employee', {
  p_employee_number: num
});
```
- Tratar os casos de retorno: `employee_not_found`, `already_linked`, `already_linked_real`, `linked`

**Impacto minimo:** A coluna `is_active` default `true` nao afeta dados existentes. A funcao RPC so desativa perfis com email `@fleet.local`. Perfis desativados continuam na base de dados para auditoria.
