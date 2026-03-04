

# Fix: "Cannot access 'resolveDriverInfo' before initialization"

## Problem

The edge function logs show a fatal error:
```
Erro ao processar Auchan: Cannot access 'resolveDriverInfo' before initialization
```

The function `resolveDriverInfo` is defined at **line 1268** (inside the card_events processing loop) but is called at **line 1226** (inside the TMX fallback block that runs earlier). This is a JavaScript temporal dead zone error -- the `const` declaration exists but hasn't been reached yet when the TMX fallback code tries to call it.

This error crashes the entire sync for the Auchan client, meaning **no vehicles get updated** and the backfill/stale-clear fixes from the previous changes are never reached.

## Root Cause

The TMX fallback dedup code (added in a previous fix at lines 1224-1230) calls `resolveDriverInfo()` to get driver name/employee number for card_events insertion. But `resolveDriverInfo` is a `const` defined 40 lines later at line 1268.

## Solution

Move the `resolveDriverInfo` helper function **before** it is first used. Specifically, move the function definition (lines 1268-1290 approximately) to just before the loop that processes `batchResults` (around line 1180), so it's available to both the TMX fallback block (line 1226) and the normal card_events block (lines 1310+).

### File to change
- `supabase/functions/sync-trackit-data/index.ts` -- move `resolveDriverInfo` definition before its first usage

