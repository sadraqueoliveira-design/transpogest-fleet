

# Adicionar "Última Inserção" ao Card de Resumo

## Objetivo
Mostrar no card de resumo (topo da página) informação sobre a última inserção de cartão no tacógrafo, complementando os dados de mapeamento e validade que ja existem.

## Alterações

### Ficheiro: `src/pages/admin/TachographCards.tsx`

1. **Novo indicador no card de resumo** -- Adicionar uma terceira coluna de estatísticas ao lado de "Mapeados" e "Sem perfil", mostrando:
   - Icone de relógio (Clock)
   - A data/hora da inserção mais recente entre todos os motoristas (a atividade global mais recente)
   - Label "Última Inserção"

2. **Calcular a inserção mais recente** -- Percorrer o `lastActivity` e encontrar o timestamp mais recente para mostrar no card de resumo.

3. **Detalhe visual** -- Formato: "dd/MM as HH:mm" com cor neutra, consistente com o resto do card.

