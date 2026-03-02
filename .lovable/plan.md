
# Ajustar Posicionamento das Assinaturas no PDF

## Problema
As assinaturas no PDF gerado estao mal posicionadas. A assinatura do gestor (campo 20) e a assinatura do motorista (campo 22) usam offsets fixos (`y - 8`) que as colocam demasiado acima da linha de assinatura, e as coordenadas X nao estao alinhadas corretamente com o campo "Assinatura:".

## Alteracoes propostas

**Ficheiro:** `src/lib/generateDeclarationPDF.ts`

### 1. Assinatura do Gestor (campo 20, linha ~285)
- **Atual:** `doc.addImage(..., margin + 25, y - 8, 50, 15)` — imagem colocada 8mm acima da linha, comecando a 45mm da esquerda
- **Corrigido:** Guardar a posicao Y da linha "Assinatura:" e colocar a imagem centrada verticalmente sobre essa linha, alinhada a direita do texto "Assinatura:"
- Nova posicao: `doc.addImage(..., margin + 30, y - 4, 40, 12)` — mais pequena, melhor centrada sobre a linha pontilhada

### 2. Assinatura do Motorista (campo 22, linha ~313)
- **Atual:** `doc.addImage(..., margin + 45, y - 8, 50, 15)` — demasiado deslocada a direita e alta
- **Corrigido:** Alinhar com o texto "Assinatura do conductor:" e centrar sobre a linha pontilhada
- Nova posicao: `doc.addImage(..., margin + 55, y - 4, 40, 12)` — proporcional ao texto do label mais longo

### 3. Carimbo da empresa (linhas ~366-383)
- Manter logica de posicionamento aleatorio mas ajustar `baseY` para ficar sobre a area da assinatura do gestor (campo 20), nao relativo ao `borderBottom` que pode variar

## Detalhes tecnicos

Coordenadas ajustadas:
- Assinatura gestor: X = `margin + 30` (apos "Assinatura:..."), Y = `sigLine20Y - 4`, tamanho = 40x12mm
- Assinatura motorista: X = `margin + 55` (apos "Assinatura do conductor:..."), Y = `sigLine22Y - 4`, tamanho = 40x12mm  
- Guardar as posicoes Y das linhas de assinatura em variaveis (`sigLine20Y`, `sigLine22Y`) para referencia estavel do carimbo

Isto garante que:
- As assinaturas ficam sobrepostas na linha pontilhada, como se fossem manuscritas
- O tamanho e proporcional e nao ultrapassa a area designada
- O carimbo fica posicionado sobre a assinatura do gestor
