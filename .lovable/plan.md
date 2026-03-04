

# Fix: Infinite removal/backfill loop for 42-HX-80

## Problem

The screenshot shows 8+ "removed" events for 42-HX-80, one every ~5-10 minutes (09:19, 09:25, 09:30, 09:40, 09:50, 10:00, 10:05). The correct insertion time is **02:30:37** (visible as the last row). The system is stuck in a destructive loop:

```text
Cycle N:   card_inserted_at=null + card_present=true → BACKFILL sets card_inserted_at=TMX(~09:30)
           But BACKFILL does NOT create a card_event in card_events table
Cycle N+1: lastRealInsertionMap still points to March 2 (56h ago) → sessionAge=56h > 48h
           → CARD-STALE-CLEAR fires → card_inserted_at=null + new "removed" event
Cycle N+2: → BACKFILL again → repeat forever
```

Two bugs combine:
1. **BACKFILL (line 860-867)** sets `vehicles.card_inserted_at` but never creates a `card_event`, so `lastRealInsertionMap` never updates
2. **CARD-STALE-CLEAR (line 800)** fires regardless of driver state (`ds1=2` means driver is actively working)

## Solution — 3 changes in `sync-trackit-data/index.ts`

### 1. BACKFILL must create a card_event (with dedup)
At line 860-867, after setting `card_inserted_at`, also insert an `inserted` event in `card_events` with `source: 'backfill'`. Before inserting, check if one already exists today to avoid duplicates. This breaks the loop because `lastRealInsertionMap` will have a recent timestamp next cycle.

### 2. CARD-STALE-CLEAR must respect active driver state
At line 800, change condition from:
```typescript
} else if (sessionAge >= FORTY_EIGHT_HOURS) {
```
to:
```typescript
} else if (sessionAge >= FORTY_EIGHT_HOURS && (newDriverState1 === 0 || newDriverState1 === null)) {
```
If `ds1 > 0` (driver working/driving), push to recheck instead of forcing removal.

### 3. Clean up existing spurious events
The 7+ "removed" events created today for 42-HX-80 are all spurious (from the loop). These will remain in the database but the loop will stop. The correct insertion at 02:30:37 already exists and will be preserved by the pairing logic in `CardHistory.tsx`.

### Files to change
- `supabase/functions/sync-trackit-data/index.ts` — backfill block + STALE-CLEAR condition

