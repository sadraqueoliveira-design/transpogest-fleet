

# Fix: Importação do Mapa de Manutenções falha com "coluna matrícula não encontrada"

## Diagnóstico

A base de dados tem 271 registos de manutenção existentes, portanto o problema não é a página em si — é que a importação do ficheiro continua a falhar e os dados novos não estão a ser carregados.

O problema está na deteção do formato transposto. A função `isTransposedFormat` e `parseTransposedFile` procuram labels nas primeiras 6 colunas, mas o ficheiro real pode ter:
- Células mescladas que o XLSX interpreta de forma diferente
- Labels em colunas diferentes do esperado
- Caracteres especiais ou formatação que não correspondem às strings esperadas

## Solução

Reescrever a lógica de deteção para ser muito mais robusta:

1. **Scan completo de todas as células** — em vez de verificar apenas as primeiras 6 colunas, varrer TODAS as colunas das primeiras 50 linhas para encontrar labels conhecidos
2. **Deteção dinâmica da coluna de labels** — encontrar automaticamente a coluna que contém mais labels, em vez de assumir posição fixa
3. **Deteção da linha MATRICULAS por conteúdo** — se a label "MATRICULAS" não for encontrada, procurar a linha que contém padrões de matrículas portuguesas (XX-XX-XX)
4. **Fallback por padrão de matrícula** — usar regex `/^\d{2}-[A-Z]{2}-\d{2}$/` para identificar a linha de matrículas mesmo que a label esteja ausente ou diferente
5. **Adicionar logging detalhado** — mostrar no console exatamente o que foi lido do ficheiro para facilitar debug futuro
6. **Mostrar todas as viaturas na grelha** — alterar o filtro `filteredVehicles` para incluir também veículos sem dados de manutenção, permitindo adicionar dados inline

### Ficheiro a alterar
- `src/components/admin/MaintenanceImportExport.tsx` — reescrever `isTransposedFormat`, `parseTransposedFile` e fallback de deteção de matrículas
- `src/pages/admin/Maintenance.tsx` — mostrar todos os veículos na grelha (não apenas os que já têm schedule)

