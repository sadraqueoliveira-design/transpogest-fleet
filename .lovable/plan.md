

# Fix: Debounce removals to prevent TMX jitter from creating spurious events

## Problem analysis

Looking at the data for **BN-86-PD** and **42-HX-80**, both show the exact same pattern:
- Multiple rapid `removed` events between 09:19 and 10:06 (every 5-10 minutes)
- Then a `backfill` insertion at ~10:28/10:55
- The driver actually inserted the card around 05:00-06:00

The existing fixes (CARD-OVERRIDE, CARD-REMOVE-SUPPRESSED) don't help here because in these cases the **raw TMX itself** was reporting `card_present=false`. The system correctly recorded removals each sync cycle. Then when TMX finally showed the card again, it created a new backfill with the current TMX timestamp (10:28/10:55), losing the original 05:00-06:00 time forever.

The `lastRealInsertionMap` fallback at line 1309 also doesn't help because there was no prior `inserted` event recorded for today -- the card was already present when the sync started (pre-dawn), so the system never captured an insertion event.

**Root causes**:
1. No debounce on removals -- if TMX flickers `card_present` over 30-40 minutes, each sync creates a removal event
2. No "first-seen" timestamp preserved -- when a card is first detected (no prior events), the first TMX timestamp should be preserved even through jitter cycles

## Solution

### Change 1: Debounce removals (anti-flicker)
In the removal logic (line 769), before creating a removal event, check if the vehicle already has multiple recent removals (last 60 minutes) in `card_events`. If there are ≥3 removals in the last hour without a corresponding insertion, this is TMX jitter -- suppress the removal and preserve `card_inserted_at`.

Implementation: pre-fetch a `recentRemovalCountMap` alongside `lastRealRemovalMap` -- count removals per plate in the last 90 minutes. If count ≥ 2, suppress any new removal.

### Change 2: Preserve earliest backfill timestamp
When a backfill insertion is created and there's an existing `card_inserted_at` in the DB that is **earlier** than the current TMX timestamp, keep the earlier one. The backfill should represent "we first detected the card" -- if we already detected it earlier, that's the correct time.

In the fallback chain (line 1309), add: if `result.isBackfill` and `existing.card_inserted_at` is from today and is earlier than the computed `insertionTime`, use `existing.card_inserted_at` instead.

### File to change
`supabase/functions/sync-trackit-data/index.ts`:

1. **Near line 310**: Add query to count recent removals per plate (last 90 min) into `recentRemovalCountMap`
2. **Line 769-783**: Before recording a removal, check `recentRemovalCountMap`. If ≥ 2 recent removals exist and no insertion between them, suppress this removal (treat as jitter)
3. **Line 1309-1313**: After computing `insertionTime`, if this is a backfill and `existing.card_inserted_at` is from today and earlier, use the existing one

### Expected outcome
- Vehicles like BN-86-PD and 42-HX-80 will stop accumulating dozens of spurious removal events from TMX jitter
- The `card_inserted_at` will stabilize at the first-detected timestamp instead of drifting forward
- Real removals (single, clean transition) will still be recorded normally

