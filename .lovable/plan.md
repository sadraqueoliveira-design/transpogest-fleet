

# Corrigir botao "Re-gerar PDFs" e melhorar feedback

## Problema identificado

O botao "Re-gerar PDFs" tem `disabled={selectedIds.size === 0 || bulkRegenerating}`, mas o estado desativado pode nao ser visualmente claro. O utilizador clica repetidamente sem resultado porque nao ha declaracoes selecionadas. Alem disso, possiveis erros silenciosos no pipeline de regeneracao (download de assinaturas, upload de PDF) sao apenas logados no console, sem feedback ao utilizador.

## Alteracoes no ficheiro `src/pages/admin/Declarations.tsx`

### 1. Adicionar feedback quando o utilizador clica sem selecao
- Envolver o botao "Re-gerar PDFs" num wrapper que detete cliques mesmo quando o botao esta desativado
- Mostrar um toast informativo: "Selecione declaracoes primeiro (use 'Selecionar todas as assinadas')"

### 2. Melhorar feedback visual da barra de acoes
- Quando `selectedIds.size === 0`, mostrar texto descritivo mais proeminente
- Quando ha itens selecionados, mostrar contagem no botao Re-gerar (ex: "Re-gerar PDFs (5)")
- Adicionar uma animacao ou destaque ao botao "Selecionar todas as assinadas" quando nada esta selecionado

### 3. Tratar erros silenciosos no `buildPdfForDecl`
- Atualmente `fetchImageAsDataUrl` falha silenciosamente com `console.warn`
- Adicionar contadores de assinaturas que falharam ao carregar
- No toast final do `handleBulkRegenerate`, incluir aviso se houve assinaturas nao encontradas

### 4. Adicionar try/catch robusto ao botao individual "Re-gerar" por linha
- O botao inline (linha 889-904) ja tem try/catch mas pode falhar antes de mostrar feedback
- Adicionar loading state individual para evitar duplo-clique

### 5. Corrigir warning do Badge ref
- O console mostra "Function components cannot be given refs" vindo do Badge dentro dos cards
- Causa: o Badge nao usa `forwardRef` mas esta a receber ref de algum parent
- Nao afeta funcionalidade mas polui o console

## Detalhes tecnicos

Alteracoes concentradas em `src/pages/admin/Declarations.tsx`:

```text
Botao Re-gerar PDFs (atual):
  disabled={selectedIds.size === 0 || bulkRegenerating}
  -> clique ignorado silenciosamente

Botao Re-gerar PDFs (proposto):
  - Sempre habilitado visualmente
  - Se selectedIds.size === 0, mostra toast explicativo em vez de ficar disabled
  - Se ha selecao, executa handleBulkRegenerate normalmente
```

Alternativa mais simples (manter disabled mas adicionar tooltip):
- Usar Tooltip do Radix para mostrar "Selecione declaracoes primeiro" ao hover no botao desativado

## Resultado esperado
- Utilizador entende imediatamente porque o botao nao funciona
- Apos selecionar declaracoes, a regeneracao executa com feedback de progresso
- Erros de assinatura sao comunicados no toast final
