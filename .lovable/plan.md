

# Melhorar Responsividade da Página Frota para Telemóveis

## Problema

A página de Gestão de Frota usa uma tabela HTML com 10 colunas que não se adapta bem a ecrãs pequenos. No telemóvel, a tabela fica cortada e difícil de usar (como mostra a imagem).

## Solução

Substituir a tabela por um layout responsivo: **cards em mobile, tabela em desktop**.

### Implementação

**Ficheiro:** `src/pages/admin/Fleet.tsx`

1. **Header/botões (linhas 219-257):** Reorganizar para empilhar verticalmente em mobile — título em cima, botões em baixo com `flex-wrap` e tamanhos menores.

2. **Filtros (linhas 260-275):** Empilhar verticalmente em mobile (`flex-col sm:flex-row`), select ocupa largura total.

3. **Tabela (linhas 277-365):** 
   - Manter a `<Table>` mas escondê-la em mobile (`hidden lg:block`)
   - Adicionar uma vista de cards visível apenas em mobile (`lg:hidden`) que mostra cada veículo como um card com:
     - Matrícula + Marca/Modelo no topo
     - Cliente
     - Badges de validade (Seguro, Inspeção, Tacógrafo) em linha
     - Dados de telemetria (Combustível, Km, Horas) compactos
     - Botões de ação (Editar, Docs, Eliminar)
   - Edição inline em mobile usa um layout empilhado com inputs de largura total

4. **Diálogos:** O diálogo de documentos já usa `max-w-lg` e funciona razoavelmente; ajustar o grid interno para `grid-cols-1` em mobile.

