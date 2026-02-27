

## Substituir slider por input numérico no raio de proximidade

### O que muda

Trocar o `Slider` por um `Input` numérico com botões +/- para ajustar o raio de proximidade. Mais direto e fácil de usar.

### Alteração

**Ficheiro: `src/pages/admin/Dashboard.tsx`**

Dentro do `PopoverContent` do raio de proximidade (linhas ~616-630), substituir o bloco do `Slider` por:

- Um `Input` do tipo `number` com `min=0.5`, `max=10`, `step=0.5`
- Botões `-` e `+` nos lados para incrementar/decrementar 0.5 km
- Ao alterar o valor (on blur ou Enter), gravar no backend com `updateProximityRadius`
- Manter o estado local `proximityRadius` atualizado em tempo real para feedback visual

Remover a importação do `Slider` se deixar de ser usado noutro local do ficheiro.

### Detalhe técnico

```text
Antes:
  [Label: Raio de proximidade]  [0.5 km]
  [========O================] (slider)

Depois:
  [Label: Raio de proximidade]
  [ - ]  [ 2.0 ]  [ + ]  km
```

- `onChange` no input atualiza `setProximityRadius` localmente
- `onBlur` e tecla Enter chamam `updateProximityRadius(valor)` para persistir
- Botões +/- atualizam localmente e gravam imediatamente no backend
- Validação: clamp entre 0.5 e 10
