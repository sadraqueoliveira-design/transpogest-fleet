

# Plano: Cartao do tacografo - mostrar horario de insercao e ocultar sem cartao

## Problema atual

A linha "Cartao" nos cards do Dashboard aparece sempre que existe um timestamp `tmx` no JSON do tacografo, mesmo quando nao ha cartao de motorista inserido (`dc1` vazio ou null). O utilizador quer que:

1. So mostre a linha "Cartao" quando existe um cartao de motorista efetivamente inserido (campo `dc1` presente no JSON do tacografo)
2. Quando ha cartao, mostre o horario de insercao (`tmx`)
3. Quando NAO ha cartao inserido, nao mostrar valores nessa linha

## Alteracao

**Ficheiro**: `src/pages/admin/Dashboard.tsx`

**Linha ~706**: Alterar a condicao de exibicao da linha "Cartao"

De:
```
{(tacho.tmx || lastActivity[v.id]) && (
```

Para:
```
{driverCard && (tacho.tmx || lastActivity[v.id]) && (
```

Isto garante que a linha so aparece quando `dc1` (o numero do cartao do motorista) esta preenchido no JSON do tacografo, significando que ha um cartao fisicamente inserido no dispositivo.

## Resultado esperado

- Veiculos COM cartao inserido: mostram a linha "Cartao" com data/hora da insercao
- Veiculos SEM cartao inserido: nao mostram a linha "Cartao" de todo

