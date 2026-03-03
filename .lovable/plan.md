

# Diagnose: driverList still not resolving

## Findings from logs

- **Vehicle sync works**: "321 veículos encontrados" at 11:52:59, card processing at 11:53:00
- **No `[DRIVERLIST]` log entries at all** — not even the "resolved with 0 drivers" line (1180), meaning the function is killed before the Promise.race on line 1176 completes
- The 321-vehicle upsert + card event processing likely consumes most of the ~60s wall clock, leaving no time for the 10s grace period

## Root cause

The Trackit `/ws/driverList` API consistently takes 30-50s to respond. Combined with vehicle processing (~50s for 321 vehicles with card events), the total exceeds the edge function's 60s limit. The "non-blocking" pattern doesn't help because there's simply no wall clock left.

## Solution: Dedicated edge function for driverList

Create a separate `sync-driver-compliance` edge function that:
1. Fetches `/ws/driverList` with a 55s timeout (has the full 60s wall clock to itself)
2. Matches drivers to vehicles by `current_mobile` = `trackit_id`
3. Updates `tachograph_status.tacho_compliance` on matching vehicles
4. Runs on its own cron (every 5 min, offset from vehicle sync)

Remove the driverList logic from `sync-trackit-data` entirely so it focuses only on vehicle telemetry.

### Changes

**New file: `supabase/functions/sync-driver-compliance/index.ts`**
- Fetch all active clients with Trackit credentials
- For each client, call `/ws/driverList` (55s timeout)
- Load existing vehicles with their `trackit_id`
- Match `tacho_data.current_mobile` to `trackit_id`
- Update `tachograph_status` JSON with compliance data
- Log match counts

**Edit: `supabase/functions/sync-trackit-data/index.ts`**
- Remove `fetchWithRetry` helper
- Remove `driverListPromise` (lines 64-82)
- Remove Promise.race and driverList processing (lines 1175-1228)
- Function now only handles vehicle telemetry + card events

**Edit: `supabase/config.toml`**
- Add `[functions.sync-driver-compliance]` with `verify_jwt = false`

### Technical details

The new function will be ~80 lines:
```typescript
// Pseudocode
for each client with trackit credentials:
  fetch /ws/driverList (55s timeout)
  fetch vehicles from DB where client_id matches
  for each driver with tacho_data.current_mobile:
    find vehicle where trackit_id = current_mobile
    merge tacho_compliance into tachograph_status
    update vehicle
```

This guarantees the driverList has the full 60s wall clock independently, and vehicle sync completes faster without waiting for it.

