

## Reduzir tempo de dados "stale" de 24h para 2h

Alteração simples de uma linha no Dashboard para que nomes de motoristas desapareçam mais rapidamente após a remoção do cartão.

### O que muda

No ficheiro `src/pages/admin/Dashboard.tsx`, linha 260, o threshold de dados obsoletos passa de **24 horas** para **2 horas**:

```
// Antes:
const isStale = tmx > 0 && (Date.now() - tmx) > 24 * 60 * 60 * 1000;

// Depois:
const isStale = tmx > 0 && (Date.now() - tmx) > 2 * 60 * 60 * 1000;
```

### Impacto

- Veículos sem dados de tacógrafo atualizados há mais de 2 horas deixam de mostrar o nome do motorista antigo.
- Veículos ativos (com dados frescos) continuam a mostrar o nome normalmente.

