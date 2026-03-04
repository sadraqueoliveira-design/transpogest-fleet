

# Fix: card_inserted_at overwritten by TMX when event API fails

## Problem

Vehicle **BN-86-PD** has the correct insertion event in `card_events` at **10:28:02** (source: backfill, from event-45 API). However, `vehicles.card_inserted_at` shows **11:20:21** -- a TMX timestamp from a later sync cycle.

**Root cause**: When the sync detects `!oldHasCard && newHasCard` (new insertion), it calls the Trackit event API for the exact timestamp. If the API fails (HTTP 502 or JSON parse errors -- frequent in the logs), the fallback chain at line 1297 uses the current TMX telemetry timestamp instead:

```typescript
const insertionTime = result.eventTime           // API failed → null
  || (tachoTimestamp ? ... : null)                // TMX → 11:20 (wrong!)
  || new Date().toISOString();
```

The system already has the correct timestamp in `lastRealInsertionMap` (pre-fetched from `card_events`), but never consults it during this fallback.

## Solution

Modify the insertion time fallback chain (line 1297) to check `lastRealInsertionMap` before falling back to TMX. If there's a real insertion event that is more recent than the last removal for this plate, use that timestamp -- it's the correct event-45 time from a previous successful API call.

### File to change
- `supabase/functions/sync-trackit-data/index.ts` (line ~1297)
  - After `result.eventTime`, add a check for `lastRealInsertionMap.get(rec.plate)` when the insertion is newer than the last removal in `lastRealRemovalMap`
  - Only then fall through to TMX

```typescript
// Before (line 1297):
const insertionTime = result.eventTime
  || (tachoTimestamp ? new Date(tachoTimestamp).toISOString() : null)
  || new Date().toISOString();

// After:
const realIns = lastRealInsertionMap.get(rec.plate);
const realRem = lastRealRemovalMap.get(rec.plate);
const realInsIsValid = realIns && (!realRem || new Date(realIns.timestamp).getTime() > new Date(realRem).getTime());
const insertionTime = result.eventTime
  || (realInsIsValid ? realIns.timestamp : null)
  || (tachoTimestamp ? new Date(tachoTimestamp).toISOString() : null)
  || new Date().toISOString();
```

This ensures that once a correct event-45 timestamp is captured, subsequent sync cycles won't overwrite it with a drifting TMX timestamp when the API is unavailable.

