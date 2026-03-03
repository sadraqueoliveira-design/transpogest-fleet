

# Fix: Sync function times out — reverse geocoding is the real bottleneck

## Problem

The sync function times out before reaching the RECHECK-CAP logic. The real bottleneck is **reverse geocoding**, not the recheck lookups:

- 321 Auchan vehicles are geocoded in batches of 5
- Each batch has a **1.1 second delay** (line 262) to respect Nominatim rate limits
- 64 batches × 1.1s = **~70 seconds of delays alone** (plus HTTP latency)
- Edge functions have a ~60s timeout → function dies before reaching card recheck code

The RECHECK-CAP log never appears because the function never gets that far.

## Solution

Two changes in `supabase/functions/sync-trackit-data/index.ts`:

### 1. Skip geocoding for vehicles whose position hasn't changed
Only reverse geocode vehicles where `last_lat`/`last_lng` actually changed from the existing record. Vehicles that haven't moved already have a `last_location_name` — no need to re-geocode them. This should reduce the geocoding count from ~321 to ~30-50 moving vehicles.

**How**: Move the geocoding AFTER `existingMap` is built (line 300). Compare `rec.last_lat`/`rec.last_lng` with `existing.last_lat`/`existing.last_lng` — if both match (within ~0.0005° / ~50m), reuse `existing.last_location_name` instead of calling Nominatim.

### 2. Reduce the inter-batch delay from 1100ms to 300ms
Nominatim's policy is 1 req/sec per IP. Since we batch 5 concurrent requests, a 300ms delay between batches is still conservative (5 requests then pause). With only ~30-50 vehicles to geocode, this means ~3-5 seconds total instead of 70+.

### 3. Move existingVehicles query before geocoding
Currently `existingVehicles` is fetched at line 295, AFTER geocoding. We need to move it before the geocoding loop so we can compare positions. Also add `last_lat, last_lng, last_location_name` to the select.

## Concrete changes

1. **Move the existingVehicles query** (lines 294-301) to before the reverse geocoding block (before line 252)
2. **Add columns** to the select: `last_lat, last_lng, last_location_name`
3. **In the geocoding loop** (lines 254-264), add a position-change check:
   - If existing vehicle has same lat/lng (within 0.001°), set `rec.last_location_name = existing.last_location_name` and skip geocoding
4. **Reduce delay** from `1100` to `300`ms (line 262)

## Expected impact

- Geocoding calls drop from ~321 to ~30-50 per cycle (only vehicles that moved)
- Total geocoding time: ~3-5 seconds instead of ~70+ seconds
- Function completes well within timeout
- RECHECK-CAP and card recheck logic finally executes
- 42-HX-75 gets its `card_inserted_at` corrected

