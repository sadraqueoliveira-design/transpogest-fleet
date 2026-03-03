

# Fix: Recheck logic causes timeout — 168 vehicles trigger event lookups

## Problem

The recheck logic works correctly in code, but it's causing the edge function to **time out**. There are 168 vehicles with `card_present=true` and `card_inserted_at > 12h ago`, each triggering an additional API call to Trackit's `/ws/events` endpoint. At 5 concurrent calls per batch, that's 34 extra batches of slow HTTP requests, pushing the function well past its execution limit.

Result: the function times out before completing, and 42-HX-75 never gets its `card_inserted_at` updated.

## Solution

Two changes in `supabase/functions/sync-trackit-data/index.ts`:

### 1. Increase recheck threshold from 12h to 20h
Most drivers do daily shifts. A 20h threshold (instead of 12h) will only trigger rechecks for genuinely overnight sessions while excluding vehicles that were just checked a few hours ago. This alone reduces the recheck count significantly.

### 2. Cap recheck lookups per sync cycle
Add a maximum of **15 recheck lookups per client sync** to prevent timeouts. Prioritize the oldest sessions first (most likely to be stale). Vehicles that don't get rechecked in this cycle will be picked up in the next 5-minute sync.

### 3. Add a log before the batch loop showing the count
Add `console.log` showing how many recheck lookups are queued vs capped, to help debug future issues.

### Concrete changes

In the recheck block (~line 519):
- Change `TWELVE_HOURS` to `TWENTY_HOURS` (20 * 60 * 60 * 1000)

After the card event detection loop (~line 533):
- Filter `cardEventLookups` to cap "recheck" entries at 15 per batch, sorted by oldest `existingCardInsertedAt` first
- Log: `[RECHECK-CAP] X recheck lookups queued, capped to Y`

## Expected impact

- Recheck count drops from ~168 to ~15 per cycle (capped)
- Oldest sessions (like 42-HX-75) get priority and are corrected first
- Function completes within timeout
- All stale sessions are corrected within ~1 hour (across multiple 5-min sync cycles)

