
Objetivo: resolver os 3 pontos que reportaste na página de Declarações:
1) regenar em massa os PDFs assinados,
2) permitir desarquivar,
3) fazer os cards “Pendentes / Assinadas / Arquivadas” realmente filtrarem a lista (hoje só mostram contagem).

Diagnóstico do que está hoje (confirmado no código)
- O botão “Re-gerar PDFs” existe, mas só aparece quando há linhas selecionadas (`selectedIds.size > 0`), por isso parece “desaparecido”.
- Existe ação de “Arquivar” para estado `signed`, mas não existe ação de “Desarquivar” para estado `archived`.
- Os 3 cards de resumo apenas mostram números; não têm `onClick`, portanto “não fazem nada”.
- A tabela mostra todas as declarações sempre, sem filtro visual por estado.

Escopo de implementação (sem alterar backend/BD)
- Arquivo principal: `src/pages/admin/Declarations.tsx`
- Não será necessário migration nem alteração de políticas de acesso.
- A lógica de regeneração já existe (`handleBulkRegenerate`), vamos melhorar a acessibilidade/UX dela.

Plano de implementação

1) Tornar os cards de estado clicáveis e funcionais
- Adicionar estado local de filtro, por exemplo:
  - `activeStatusFilter: "all" | "draft" | "signed" | "archived"`
- Transformar os cards em botões clicáveis:
  - Card “Pendentes” => aplica filtro `draft`
  - Card “Assinadas” => aplica filtro `signed`
  - Card “Arquivadas” => aplica filtro `archived`
  - Opcional: clique no mesmo card novamente limpa o filtro para `all`
- Aplicar o filtro na renderização da tabela (lista derivada `filteredDeclarations`).
- Dar feedback visual claro no card ativo (borda/cores/label “Filtro ativo”).

2) Mostrar ações em massa de forma mais clara (incluindo re-gerar)
- Manter a segurança de execução apenas com seleção, mas melhorar visibilidade:
  - Mostrar barra de ações sempre (ou com estado disabled) para o utilizador perceber que existe.
  - “Re-gerar PDFs” desativado quando `selectedIds.size === 0`, com texto de ajuda “Selecione declarações assinadas”.
- Adicionar ação rápida: “Selecionar todas as assinadas”
  - Preenche `selectedIds` com todos os IDs em `status === "signed"` (respeitando filtro atual, se aplicável).
- Atualizar `toggleSelectAll` para atuar sobre a lista filtrada exibida (não sobre o dataset completo), evitando comportamento confuso.

3) Adicionar fluxo de desarquivar
- Criar função `handleUnarchive(id)`:
  - Update em `activity_declarations` para `status: "signed"` (estado anterior funcional para documentos já assinados).
- Exibir botão “Desarquivar” nas linhas `status === "archived"`.
- Após sucesso: toast + refresh da lista (`fetchDeclarations`), mantendo filtro atual.

4) Melhorar ação “PDF Assinado” para evitar ficheiro antigo sem correções
- Hoje, quando existe `signed_pdf_url`, abre diretamente esse ficheiro (pode estar desatualizado).
- Ajustar UX para deixar explícito:
  - “Abrir PDF guardado” (ficheiro existente)
  - “Re-gerar agora” (usa lógica atual corrigida e atualiza `signed_pdf_url`)
- Isto evita confusão de “as alterações não ficaram salvas” e aplica correções retroativas de assinaturas/nome do gestor.

5) Robustez e feedback operacional
- No `handleBulkRegenerate`:
  - Mostrar progresso (ex.: `A re-gerar 3/15...`) e botão disabled durante execução.
  - Relatório final mais claro: quantos sucesso, quantos falharam.
  - Manter seleção apenas dos que falharam (opcional útil para re-tentar).

Detalhes técnicos
- Reutilizar funções já existentes:
  - `buildPdfForDecl`
  - `handleBulkRegenerate`
  - `uploadSignedPDF`
- Novos estados esperados:
  - `activeStatusFilter`
  - `bulkRegenerating` (separado de `bulkDownloading`)
- Lista de tabela passa a vir de:
  - `const filteredDeclarations = declarations.filter(...)`
- Seleção “all” passa a usar `filteredDeclarations`, não `declarations`.

Critérios de aceitação
- Clicar no card “Pendentes / Assinadas / Arquivadas” filtra imediatamente a tabela.
- Existe ação visível para “Re-gerar PDFs” sem parecer escondida.
- “Selecionar todas as assinadas” seleciona automaticamente as assinadas e permite regeneração em massa.
- Declarações arquivadas passam a mostrar botão “Desarquivar”.
- Após desarquivar, a declaração volta para assinadas e aparece corretamente no filtro.
- Regeneração em massa atualiza `signed_pdf_url` e os PDFs novos refletem correções de assinatura/nome do gestor.

Riscos e mitigação
- Risco: seleção inconsistente ao trocar filtros.
  - Mitigação: limpar seleção ao mudar filtro, ou limitar seleção ao conjunto filtrado.
- Risco: utilizador confundir “abrir guardado” com “re-gerar”.
  - Mitigação: nomenclatura explícita e toasts de confirmação.
- Risco: regressão no fluxo de assinatura manual.
  - Mitigação: não alterar funções de assinatura, apenas ações de listagem/estado.

Validação recomendada após implementação
1) Filtrar por “Assinadas”.
2) Clicar “Selecionar todas as assinadas”.
3) Clicar “Re-gerar PDFs”.
4) Abrir uma declaração e confirmar:
   - assinatura(s) visível(is),
   - nome do gestor correto (sem “(Auto)” no formato final),
   - estado mantém-se consistente.
5) Arquivar uma assinatura e depois desarquivar para validar ciclo completo.
