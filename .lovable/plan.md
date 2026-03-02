
## Corrigir Gestao de Assinatura e Eliminacao de Regras de Auto-Aprovacao

### Problemas Identificados

1. **Assinatura do gestor nao pode ser alterada**: Quando uma regra ja tem assinatura (`digital_signature_url`), o codigo apenas mostra a imagem sem botoes para alterar ou remover.

2. **Eliminacao de regras pode estar a falhar silenciosamente**: A funcao `handleDeleteRule` nao mostra feedback de erro ao utilizador.

### Alteracoes Planeadas

**Ficheiro**: `src/pages/admin/ApprovalRules.tsx`

1. **Adicionar botoes de acao na assinatura existente** (linhas 374-381):
   - Quando a assinatura ja existe, mostrar a imagem junto com dois botoes: "Alterar" (abre o dialog de assinatura) e "Remover" (limpa o campo `digital_signature_url`).

2. **Adicionar funcao `handleRemoveSignature`**:
   - Nova funcao que faz `update({ digital_signature_url: null })` na regra e recarrega os dados.

3. **Permitir alterar assinatura de regra existente**:
   - O botao "Alterar" vai definir `pendingRuleId` com o ID da regra e abrir o dialog `showRuleSig`, reutilizando o fluxo ja existente de `handleRuleSignature`.

4. **Melhorar feedback na eliminacao de regras**:
   - Adicionar toast de erro em `handleDeleteRule` caso falhe.

### Resultado Esperado

- Ao lado da imagem da assinatura, aparecem icones para alterar ou remover.
- Clicar em "Alterar" abre o pad de assinatura e substitui a anterior.
- Clicar em "Remover" limpa a assinatura da regra.
- Eliminar regras mostra feedback caso falhe.
