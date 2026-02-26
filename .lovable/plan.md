

## Reestruturar Historico de Cartoes: Hora de Insercao e Hora de Retirada

### Objetivo
Alterar a tabela para mostrar pares de eventos (insercao + retirada) numa unica linha, com colunas separadas para "Hora Insercao" e "Hora Retirada", em vez de linhas individuais por evento.

### Alteracoes

**Ficheiro: `src/pages/admin/CardHistory.tsx`**

1. **Agrupar eventos por sessao**: Emparelhar eventos `inserted` e `removed` do mesmo cartao/motorista na mesma viatura, criando linhas com hora de entrada e hora de saida.

2. **Nova estrutura da tabela**:

| Motorista | N. Func. | Matricula | Hora Insercao | Hora Retirada | Duracao |
|-----------|----------|-----------|---------------|---------------|---------|
| Joao Silva | 1234 | 00-AB-00 | 06:30:00 | 14:45:00 | 8h 15m |
| Maria Santos | 5678 | 11-CD-11 | 07:00:00 | — | Em curso |

3. **Logica de emparelhamento**:
   - Ordenar eventos cronologicamente por cartao/viatura
   - Cada `inserted` abre uma sessao
   - O proximo `removed` do mesmo cartao+viatura fecha a sessao
   - Se nao houver `removed`, mostrar "Em curso" ou "—"
   - Calcular duracao entre insercao e retirada

4. **Exportacao atualizada**: Adaptar os dados de exportacao para refletir a nova estrutura com colunas separadas para hora de insercao e retirada.

### Secao Tecnica

**Logica de agrupamento (pseudocodigo):**
```text
Para cada evento "inserted", ordenado por event_at:
  -> Procurar o proximo "removed" com mesmo card_number + plate
  -> Criar linha: { motorista, n_func, matricula, hora_in, hora_out, duracao }
  -> Se nao encontrar removed: hora_out = null (em curso)
Eventos "removed" sem par de insercao: mostrar como linha so com hora de retirada
```

**Ficheiro a modificar:** `src/pages/admin/CardHistory.tsx`
- Adicionar `useMemo` para agrupar eventos em sessoes
- Atualizar colunas da tabela
- Atualizar `exportData` com nova estrutura
