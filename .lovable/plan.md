

# Fix: Infinite removal/backfill loop — IMPLEMENTED

## Changes made in `sync-trackit-data/index.ts`

### 1. CARD-STALE-CLEAR now respects ds1 (line 800)
Changed from `sessionAge >= FORTY_EIGHT_HOURS` to `sessionAge >= FORTY_EIGHT_HOURS && (newDriverState1 === 0 || newDriverState1 === null)`. When ds1 > 0, falls through to 12h recheck instead of forcing removal.

### 2. BACKFILL now creates card_event with dedup (line 860-914)
After setting `card_inserted_at`, also inserts an `inserted` event in `card_events` with `source: 'backfill'`. Checks for existing backfill events today to avoid duplicates. Breaks the loop because `lastRealInsertionMap` will have a recent timestamp next cycle.

### 3. TMX fallback dedup (previous change)
TMX fallback checks for existing `tmx_fallback` events today before creating new ones, preserving the earliest (most accurate) estimate.
