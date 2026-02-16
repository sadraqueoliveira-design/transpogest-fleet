

## Problema

A edge function `check-tacho-gaps` cria declarações com `gap_end_date = now()` no momento em que o cron job corre. Se o cron correu dia 14/02, esse fica como data final, mesmo que o motorista so tenha voltado dia 16/02.

O correto seria: a data final da lacuna deve ser o momento em que o motorista insere o cartao e a nova atividade e registada.

## Solucao

### 1. Na criacao da declaracao (check-tacho-gaps)
- Manter `gap_end_date` provisorio como `now()` (necessario para o formulario funcionar)
- Mas marcar claramente que e provisorio

### 2. Atualizar gap_end_date quando nova atividade e detetada
- Quando o `sync-trackit-data` (ou qualquer sincronizacao) regista uma nova atividade para um motorista que tem uma declaracao em "draft":
  - Atualizar o `gap_end_date` dessa declaracao para o `start_time` da nova atividade (o momento real em que o cartao foi inserido)

### 3. Atualizar gap_end_date na assinatura (fallback)
- Quando o motorista assina a declaracao, se o `gap_end_date` ainda nao foi atualizado, usar o timestamp atual como data final

## Alteracoes tecnicas

### Ficheiro: `supabase/functions/check-tacho-gaps/index.ts`
- Sem alteracoes necessarias (o comportamento provisorio e aceitavel)

### Ficheiro: `supabase/functions/sync-trackit-data/index.ts`
- Apos inserir novas atividades, verificar se o motorista tem declaracoes "draft" em aberto
- Se sim, atualizar o `gap_end_date` para o `start_time` da primeira nova atividade

### Ficheiro: `src/pages/driver/DriverDeclarations.tsx`
- Na funcao de assinatura, atualizar `gap_end_date` para `new Date().toISOString()` antes de submeter (fallback caso a sync nao tenha corrido)

### Ficheiro: `supabase/functions/auto-approve-declaration/index.ts`
- Atualizar `gap_end_date` para o timestamp atual no momento da auto-aprovacao

