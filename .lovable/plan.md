

# Fix: Stale sessions waste recheck slots — clear ancient sessions directly

## Problem

The LOOKUP-CAP logic exists but **98 vehicles** trigger CARD-RECHECK. Many have absurdly old sessions (18,167h, 24,840h, 9,556h) — these are inactive/abandoned vehicles. The Trackit events API only returns data from the last 24h, so querying events for a vehicle with a 2-year-old session is pointless. These waste the 10 lookup slots and push the function to timeout.

42-HX-75 (30h session) gets deprioritized behind these ancient sessions in the sort order.

## Solution

In `supabase/functions/sync-trackit-data/index.ts`, add two changes:

### 1. Auto-clear sessions older than 7 days (168h) without API calls
If `card_inserted_at` is older than 7 days and `ds1 === 0` (driver resting) or speed is 0, directly clear the session — no API lookup needed. These are definitively stale. This eliminates ~60+ of the 98 rechecks.

For sessions between 20h-168h (the interesting range), keep the existing recheck logic.

### 2. Flip sort order: prioritize NEWEST sessions first for rechecks
Currently oldest sessions get priority (line 582). But the oldest are the most stale/useless. **Newest sessions** (20-48h) are the ones likely to have real re-insertions (overnight card removal + morning re-insertion). Change sort to `bTime - aTime` for rechecks.

### Concrete changes

In the detection loop (~line 548-556), before pushing to `cardEventLookups`:
```typescript
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
if (sessionAge >= SEVEN_DAYS) {
  // Ancient session — auto-clear without API call
  (rec as any).card_inserted_at = null;
  console.log(`[CARD-STALE-CLEAR] ${rec.plate}: session ${Math.round(sessionAge/3600000)}h old, auto-clearing`);
  continue; // skip adding to cardEventLookups
}
```

In the sort comparator (~line 582):
```typescript
return bTime - aTime; // Newest first (most likely to have real events)
```

## Expected impact

- ~60+ ancient sessions auto-cleared instantly (no API cost)
- ~30-38 rechecks remain, capped to 10 — now prioritizing 20-48h sessions
- 42-HX-75 (30h) gets processed in the first batch
- Function completes well within timeout
- Stale data cleaned from the fleet view

