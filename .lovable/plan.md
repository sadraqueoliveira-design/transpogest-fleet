

# Add card_events removal override for stale TMX telemetry

## Problem

When a driver physically removes their card, the system correctly logs a `removed` event in `card_events`. However, the Trackit TMX telemetry can continue reporting `card_present=true` for an extended period (cached/stale data from the device). Since the sync logic trusts TMX over event history, the vehicle dashboard keeps showing the card as inserted even after removal was detected.

## Solution

Add two changes:

### 1. Pre-fetch last removal events (alongside insertions)
At lines 306-324, alongside the existing `lastRealInsertionMap`, also query the most recent `removed` event per plate from `card_events` into a new `lastRealRemovalMap`.

### 2. Override TMX card_present when a recent removal exists
At line 738 (after parsing `newHasCard`), add a check: if `newHasCard=true` but `lastRealRemovalMap` has a removal for this plate that is **more recent** than the last insertion in `lastRealInsertionMap`, then override `newHasCard` to `false`. This forces the existing removal logic at line 743-748 to fire, clearing `card_inserted_at`.

This ensures that once a real removal event is captured (from Trackit event API, ID 46), the system respects it even if the TMX telemetry lags behind. On the next sync where TMX finally reports `card_present=false`, nothing changes (already cleared). If a new insertion happens after the removal, the insertion timestamp will be newer than the removal, so the override won't fire.

### File to change
- `supabase/functions/sync-trackit-data/index.ts`
  - Add `lastRealRemovalMap` query near line 310
  - Add override logic after line 738

