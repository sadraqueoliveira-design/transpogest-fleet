
# Mover carimbo para perto da assinatura do gestor

## Alteracao no ficheiro `src/lib/generateDeclarationPDF.ts`

O carimbo esta actualmente posicionado no canto direito do documento (`baseX = W - margin - stampW + 2`), longe da assinatura do gestor que comeca em `sig20X` (lado esquerdo).

### Correcao
- Posicionar o carimbo imediatamente a direita da assinatura do gestor
- `baseX` passa a ser `sig20X + sigW + 2 + randX` (logo apos a assinatura, com 2mm de espaco)
- `baseY` mantem-se alinhado verticalmente com a assinatura: `sigLine20Y - 9 + randY`

### Resultado esperado
O carimbo aparece adjacente a assinatura do gestor, como seria colocado fisicamente num documento em papel.
