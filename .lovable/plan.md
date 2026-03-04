

# Fix: Capture correct early-morning card insertion time

## Problem

For **BN-86-PD**, the driver inserted the card around **05:00-06:00**, but the system only recorded an insertion at **10:28** (backfill) because:

1. The Trackit event API consistently fails for this vehicle's `mid` with `Unexpected token ,` errors -- it never returns the real event-45 timestamp
2. The "backfill" mechanism only triggers when the sync first detects `card_present=true` without a prior insertion record. If the card was already present when the sync started processing this vehicle, the backfill timestamp is the TMX time at that moment -- not when the card was actually inserted
3. There are also spurious `removed` events from 09:19-10:06 (TMX source), which means the system kept flip-flopping, finally detecting a "new insertion" at 10:28

**Core issue**: When the event API fails and the system falls back to TMX, it uses the **current** telemetry timestamp rather than trying to extract the actual tachograph insertion time from the telemetry data itself.

## Solution

Two changes to `supabase/functions/sync-trackit-data/index.ts`:

### 1. Use tachograph `tmx` timestamp more intelligently for backfills

When a backfill is detected (card present but no insertion record), and the event API fails, instead of using the current TMX timestamp directly, check if there's an older TMX timestamp from the tachograph data that better represents when the session started. The `tmx` field in `tachograph_status` is the device's last update time, not the card insertion time.

However, there's no insertion-specific timestamp in the TMX data. The only reliable source is the event API (which fails) or the existing `card_inserted_at` from the DB.

### 2. Prevent spurious removals from causing late backfill insertions

The real fix is to stop the spurious removal events (09:19-10:06) that cause the system to "rediscover" the card and create a late backfill. These removals happen because the TMX data briefly reports card absence or the sync misreads the state.

**Change**: When the system detects a removal (`oldHasCard && !newHasCard`), add a safety check -- if `card_present` is still `true` in the **new** raw telemetry AND the card number hasn't changed, skip the removal. This prevents false removals from TMX jitter.

Additionally, for backfill insertions where the event API fails, if the vehicle already has a `card_inserted_at` in the database that is from today, preserve that timestamp instead of overwriting it with the current TMX time.

### File: `supabase/functions/sync-trackit-data/index.ts`

**Change A** (~line 769): When processing a removal, verify the new telemetry actually shows no card before proceeding. If the raw `card_present` is still true but `newHasCard` was forced to false by the override logic, skip the removal event recording (the override is for dashboard display, not for creating removal events).

**Change B** (~line 1300): In the insertion time fallback, when `result.isBackfill` is true and the event API failed, check if the vehicle already has a valid `card_inserted_at` from today in the DB. If so, preserve it instead of overwriting with TMX.

```typescript
// Change B: For backfills where API failed, preserve existing DB timestamp
const insertionTime = result.eventTime
  || (realInsIsValid ? realIns.timestamp : null)
  || (result.isBackfill && result.existingCardInsertedAt ? result.existingCardInsertedAt : null)
  || (tachoTimestamp ? new Date(tachoTimestamp).toISOString() : null)
  || new Date().toISOString();
```

**Change C** (~line 757-764): In the CARD-OVERRIDE block, track that the override was applied so that downstream logic doesn't create spurious removal events when TMX still reports `card_present=true`.

### Expected outcome

- Spurious removals will be suppressed when TMX still reports the card as present
- Backfill insertions will preserve earlier timestamps from the DB instead of overwriting with later TMX times
- The `card_inserted_at` will remain at the earliest detected time rather than drifting forward with each sync cycle

