
Objetivo: corrigir a importação para deixar de reconhecer só **1 matrícula (37-ST-21)** e passar a ler todas as colunas/viaturas/reboques da planilha.

Diagnóstico (com base no código atual):
- Em `MaintenanceImportExport.tsx`, a escolha da folha do Excel está frágil:
  - No loop de seleção de sheet, o match de labels só verifica colunas `0..5` (`for (let c = 0; c <= 5; c++)`), o que pode escolher a folha errada.
- O parser transposto depende de encontrar bem a linha/coluna de labels; quando a folha selecionada não é a correta, ele acaba por importar só 1 viatura.
- O parsing CSV ainda usa split simples (`split(/[;,]/)`), o que é frágil para campos com delimitadores dentro de aspas.

Plano de implementação:

1) Reforçar a seleção da folha correta (principal correção)
- Ficheiro: `src/components/admin/MaintenanceImportExport.tsx`
- Em vez de contar labels só nas primeiras 6 colunas, avaliar cada sheet com varrimento dinâmico:
  - Normalizar cabeçalhos (maiúsculas, sem acentos, sem espaços extra).
  - Contar:
    - nº de labels reconhecidas no grid todo (ou janela ampla).
    - nº de matrículas válidas detetadas.
    - nº de categorias mapeadas.
- Escolher a folha com maior score (prioridade para nº de matrículas e categorias, não só labels).

2) Tornar deteção de labels e categorias mais resiliente
- Consolidar matching em 3 níveis:
  - igualdade exata
  - `startsWith`
  - `includes`
- Aplicar sempre após normalização (acentos/case/espaços/pontuação).
- Garantir variantes como `MÓVEL/MOVEL`, `TACÓGRAFO/TACOGRAFO`, `MANUTENÇÕES/MANUTENCOES`.

3) Melhorar extração de colunas de matrículas
- Continuar a usar linha `MATRICULAS` quando existir.
- Adicionar fallback robusto:
  - detectar colunas por padrão de matrícula (incluindo `L-` reboques) em múltiplas linhas de contexto.
  - evitar depender de posição fixa.
- Ignorar colunas “fantasma” sem dados de manutenção para reduzir ruído.

4) Reforçar parsing de CSV (hardening)
- Substituir split simples por parser stateful (suporte a aspas e delimitadores dentro de campo).
- Manter compatibilidade com `;` e `,`.

5) Observabilidade e validação no preview da importação
- Mostrar no toast/preview:
  - folha escolhida
  - nº de matrículas detetadas
  - nº de categorias detetadas
- Se detetar `< 2` matrículas, mostrar aviso explícito para facilitar diagnóstico imediato.

Validação funcional (após implementar):
- Importar o ficheiro `Mapa_de_Manutenções_1-4.xlsm`.
- Esperado:
  - mais do que 1 matrícula reconhecida (não ficar só em 37-ST-21).
  - categorias mantidas (~9, conforme ficheiro).
  - reboques `L-*` identificados e processados no mesmo fluxo.
  - dados “Móvel” mantidos para viaturas/reboques.

Impacto de backend:
- Sem novas tabelas/migrações para esta correção.
- Alteração é 100% na lógica de parsing/import do frontend.

Ficheiro a alterar:
- `src/components/admin/MaintenanceImportExport.tsx`
