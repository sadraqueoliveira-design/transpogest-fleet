

# Ajustar posicao da assinatura e carimbo no PDF

## Alteracoes no ficheiro `src/lib/generateDeclarationPDF.ts`

### 1. Assinatura do gestor -- subir um pouco
- Linha 291: alterar o offset vertical de `-2` para `-4` (sobe ~2mm)
- Resultado: `sigLine20Y - sigH / 2 - 4`

### 2. Carimbo -- mover mais para a direita
- Linha 384: reduzir o offset de `-8` para `-2`, ficando mais encostado ao lado direito
- Resultado: `W - margin - stampW - 2 + randX`

Duas alteracoes simples de posicionamento, ambas no mesmo ficheiro.

