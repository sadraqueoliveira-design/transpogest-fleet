
# Corrigir assinaturas e nome do gestor no PDF

## Problema 1: Nome do gestor aparece como "(Auto), Filipe..."
O edge function `auto-approve-declaration` guarda o `manager_name` com sufixo " (Auto)" na base de dados (linha 191). Quando o PDF e gerado, a funcao `toSurnameFirst` trata "(Auto)" como apelido.

### Correcao
- Em `buildPdfForDecl` (Declarations.tsx, linha 541): remover o sufixo " (Auto)" do `manager_name` antes de passar ao gerador de PDF
- Em `generateAndUploadPDF` (Declarations.tsx, linha 285): mesma limpeza ao passar o nome do gestor
- Manter o " (Auto)" na base de dados para rastreabilidade, mas limpar so na geracao do PDF

## Problema 2: Assinaturas nao aparecem no PDF
A funcao `fetchImageAsDataUrl` usa `fetch()` direto para URLs do Supabase Storage. Isto pode falhar silenciosamente (CORS ou rede), retornando `undefined` -- o PDF fica sem assinaturas.

### Correcao
- Alterar `fetchImageAsDataUrl` para detetar URLs do Supabase Storage e usar `supabase.storage.from(bucket).download(path)` em vez de `fetch()` direto
- Isto garante autenticacao e contorna problemas de CORS
- Manter o `fetch()` como fallback para URLs externas

## Ficheiros a alterar

### `src/pages/admin/Declarations.tsx`
1. Criar helper `cleanManagerName(name)` que remove " (Auto)" do final
2. Usar nas linhas 541 e 285
3. Alterar `fetchImageAsDataUrl` para extrair bucket e path de URLs Supabase e usar o SDK de Storage

### Detalhes tecnicos

```text
cleanManagerName("Filipe Duarte Da Luz De Oliveira (Auto)")
  -> "Filipe Duarte Da Luz De Oliveira"

toSurnameFirst("Filipe Duarte Da Luz De Oliveira")
  -> "Oliveira, Filipe Duarte Da Luz De"
```

Para assinaturas, detetar URLs no formato:
`https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>`
e extrair bucket + path para usar `supabase.storage.from(bucket).download(path)`.
