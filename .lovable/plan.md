

# Fix: Sanitizar JSON malformado da API Trackit `/ws/events`

## Diagnóstico confirmado

A API Trackit `/ws/events` está a devolver **JSON malformado** de forma consistente (não intermitente):
- Bulk: HTTP 500/502
- Individual: `"Unexpected token ,"` — indica vírgula final (trailing comma) ou outro defeito no JSON

Os retries não ajudam porque o erro é determinístico — a API devolve sempre o mesmo JSON inválido. O `eventsRes.json()` falha no parse nativo.

**Nota importante**: O `card_inserted_at = 2026-03-03 20:19:46` está **tecnicamente correto** — o cartão foi inserido ontem às 20:19 e nunca foi removido (não houve evento 46). O veículo iniciou viagem às 04:36 hoje com o mesmo cartão. Mas sem a API funcional, não sabemos se houve uma remoção/re-inserção overnight.

## Solução: Sanitizar JSON antes de fazer parse

Em vez de depender de `response.json()` (que falha com trailing commas), ler o body como texto e sanitizá-lo antes de fazer `JSON.parse()`:

### Alterações em `supabase/functions/sync-trackit-data/index.ts`

**1. Criar helper de sanitização JSON** (no topo da função, antes de `fetchCardEvents`):
```typescript
const sanitizeJson = (text: string): any => {
  // Fix trailing commas before } or ] (common Trackit API issue)
  const cleaned = text
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');
  return JSON.parse(cleaned);
};
```

**2. Em `fetchCardEvents` (linhas 492-499)**: Substituir `eventsRes.json()` por:
```typescript
const rawText = await eventsRes.text();
eventsJson = sanitizeJson(rawText);
```
E no catch do parse, logar os primeiros 200 chars do rawText para diagnóstico.

**3. Em `fetchCardEventsBulk` (linhas 607-614)**: Mesma substituição — ler como texto e sanitizar.

**4. Logar o raw response uma vez** para diagnóstico (apenas para MID 3054 / 23-IS-71):
```typescript
if (vehicleMid === 3054) {
  console.log(`[CARD-EVENTS-DEBUG] raw response (first 300 chars): ${rawText.substring(0, 300)}`);
}
```

## Impacto

- Se o problema for trailing commas no JSON, o fix resolve imediatamente e todos os veículos recebem os eventos corretos
- Se o JSON estiver corrompido de outra forma, o log de diagnóstico mostra-nos exatamente o que a API devolve para podermos adaptar
- Zero risco: se o JSON for válido, `sanitizeJson` comporta-se igual a `JSON.parse`
- O retry continua ativo como segunda camada de proteção

