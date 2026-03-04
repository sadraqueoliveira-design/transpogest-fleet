Fix aplicado: fallback individual + normalização de IDs + logs de diagnóstico para recheck_exact.

Alterações em `supabase/functions/sync-trackit-data/index.ts`:

1. **Normalização de vehicleId no bulk** (linha ~589): `Number(e.vehicleId)` + `isNaN` guard → evita mismatch string/number no Map.

2. **Logs de diagnóstico bulk** (linha ~868): 
   - `[CARD-RECHECK-BULK-START]` com lista de plates/MIDs
   - `[CARD-RECHECK-BULK-RESULT]` com contagem hits/misses

3. **Fallback individual** (linha ~925): quando bulk não devolve resultado para um veículo, executa `fetchCardEvents()` individual com mesma janela temporal. Mantém anti-regressão (`eventMs > afterMs`) e regista card_events se encontrar re-inserção.

Validação no próximo ciclo para 23-IS-71:
- `CARD-RECHECK-QUEUED-EXACT` → `CARD-RECHECK-BULK-START` → `CARD-RECHECK-BULK-RESULT`
- Se bulk miss: `CARD-RECHECK-BULK-MISS` → `CARD-RECHECK-INDIVIDUAL-HIT` ou `CARD-RECHECK-PENDING-EXACT`
