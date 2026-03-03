

# Fix: `origVehicle is not defined` crashes sync

## Root Cause

The error `"Erro ao processar Auchan: origVehicle is not defined"` at line 606 crashes the entire client sync, resulting in **0 vehicles synchronized**.

At line 606, `origVehicle` is used to access `data.drs.tmx` for the stale-rest card removal timestamp. However, `origVehicle` is only defined later at line 724 inside the card event results loop. In the current scope (the card state change detection loop starting at line 537), the variable doesn't exist.

## Fix

**File**: `supabase/functions/sync-trackit-data/index.ts`

At line 606, replace `origVehicle` with `filteredVehicles[idx]` — the same source used at line 724 to define `origVehicle`. This gives access to the raw Trackit API data for the vehicle.

```typescript
// Line 606 — BEFORE:
const staleRestTachoTs = origVehicle?.data?.drs?.tmx || origVehicle?.data?.pos?.tmx || null;

// Line 606 — AFTER:
const origV = filteredVehicles[idx];
const staleRestTachoTs = origV?.data?.drs?.tmx || origV?.data?.pos?.tmx || null;
```

Single line change, no other files affected. The sync should resume working immediately after deploy.

