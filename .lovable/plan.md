

# Fix: Tachograph Compliance Times — Use Trackit's Pre-Calculated Data

## Problem

The current `check-driving-limits` function calculates driving times (continuous, daily, weekly, bi-weekly) by summing `driver_activities` records stored in the database. These records are created during `sync-trackit-data` every 5 minutes by detecting changes in the `ds1` (driver state) field.

This approach has fundamental accuracy problems:
1. **State transitions between sync intervals are missed** — if a driver starts driving, takes a 10-min break, then resumes, all within one 5-min window, it's recorded as continuous driving
2. **The continuous driving counter is approximated** — walking backwards through activity records to find 45-min breaks is unreliable when gaps exist
3. **Sync timeouts cause missing activity records** — if the sync function times out (as it has been), entire periods of driver activity go unrecorded
4. **Daily/weekly totals drift** — small timing errors compound across hundreds of records

## Discovery: Trackit `/ws/driverList` API

The Trackit API documentation (both the PDF manual and the online docs at `trackit.targatelematics.com`) reveals a **`/ws/driverList`** endpoint that returns pre-calculated tachograph compliance data directly from the vehicle unit:

```text
GET /ws/driverList → tacho_data object per driver:
├── total_drive_journay     → Daily driving minutes (from tachograph unit)
├── total_drive_week        → Weekly driving minutes
├── total_drive_fortnight   → Bi-weekly driving minutes
├── extended_driver_count   → 10h extensions used this week
├── current_state           → 0:Rest, 1:Available, 2:Work, 3:Drive
├── is_auth                 → Currently authenticated in vehicle
├── current_mobile          → Vehicle MID (maps to trackit_id)
├── last_daily_rest         → Last daily rest timestamp
├── last_weekly_rest        → Last weekly rest timestamp
├── is_old_data             → Boolean: true if data is stale
├── perc_drive_journay      → % of daily limit used
├── perc_drive_week         → % of weekly limit used
└── perc_drive_fortnight    → % of bi-weekly limit used
```

This data is calculated by the tachograph unit itself — it's the **authoritative source** for EU 561/2006 compliance, not our approximation from 5-minute polling.

## Solution

Modify `check-driving-limits` to call `/ws/driverList` directly and use the tachograph unit's pre-calculated data as the primary source.

### Flow

1. Driver opens TachoWidget → calls `check-driving-limits` with `driver_id`
2. Function looks up the driver's vehicle → gets `client_id` → gets Trackit credentials
3. Calls `GET /ws/driverList` with those credentials
4. Finds the matching driver by matching `dr_code` against the driver's `card_number` (from `tachograph_cards` or vehicle's `tachograph_status.card_slot_1`)
5. Uses `tacho_data` fields for compliance counters (journey, week, fortnight, extensions, current state)
6. Falls back to current `driver_activities` calculation if Trackit data is unavailable or `is_old_data: true`

### Concrete changes

**File: `supabase/functions/check-driving-limits/index.ts`**

After getting the target driver ID and their vehicle, add:

```typescript
// 1. Find driver's vehicle and client
const { data: driverVehicle } = await supabaseAdmin
  .from("vehicles")
  .select("id, trackit_id, client_id, tachograph_status")
  .eq("current_driver_id", targetDriverId)
  .limit(1)
  .maybeSingle();

// 2. If vehicle found, get Trackit credentials
let trackitTachoData = null;
if (driverVehicle?.client_id) {
  const { data: clientCreds } = await supabaseAdmin
    .from("clients")
    .select("trackit_username, trackit_password")
    .eq("id", driverVehicle.client_id)
    .single();
  
  if (clientCreds?.trackit_username) {
    // 3. Call /ws/driverList
    const credentials = btoa(`${clientCreds.trackit_username}:${clientCreds.trackit_password}`);
    const res = await fetch("https://i.trackit.pt/ws/driverList", {
      headers: { Authorization: `Basic ${credentials}` }
    });
    const json = await res.json();
    
    // 4. Find matching driver by card number or current_mobile
    const vehicleMid = parseInt(driverVehicle.trackit_id);
    const driverEntry = (json.data || []).find((d: any) => 
      d.tacho_data?.current_mobile === vehicleMid && d.tacho_data?.is_auth
    );
    
    if (driverEntry?.tacho_data && !driverEntry.tacho_data.is_old_data) {
      trackitTachoData = driverEntry.tacho_data;
    }
  }
}
```

Then, in the per-driver compliance calculation, prefer Trackit data:

```typescript
// Use Trackit's authoritative data if available
const continuousDriving = trackitTachoData 
  ? /* calculate from current_state + last_daily_rest */
  : /* existing driver_activities calculation */;

const dailyDriving = trackitTachoData?.total_drive_journay ?? /* fallback */;
const weeklyDriving = trackitTachoData?.total_drive_week ?? /* fallback */;
const biweeklyDriving = trackitTachoData?.total_drive_fortnight ?? /* fallback */;
const extensionsUsed = trackitTachoData?.extended_driver_count ?? /* fallback */;
```

Map `current_state` to activity type:
```typescript
const stateMap = { 0: "rest", 1: "available", 2: "work", 3: "driving" };
const currentActivity = trackitTachoData 
  ? stateMap[trackitTachoData.current_state] 
  : currentOpen?.activity_type;
```

### Continuous driving calculation

The `driverList` API doesn't directly provide continuous driving minutes. For this, we need the `driverStatePerDriver/{did}` endpoint which gives the full activity state history. However, we'd need the Trackit driver UID (`did`), which we can get from the matched `driverList` entry (`uid` field).

Add a second API call for the current driver only:
```typescript
if (trackitTachoData && driverEntry?.uid) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().replace("T", " ").substring(0, 19);
  
  const stateRes = await fetch(
    `https://i.trackit.pt/ws/driverStatePerDriver/${driverEntry.uid}?dateBegin=${fmt(todayStart)}&dateEnd=${fmt(now)}`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );
  // Parse state transitions to calculate actual continuous driving
}
```

### Fallback strategy

If the Trackit API call fails or returns `is_old_data: true`, the function falls back to the existing `driver_activities` calculation — ensuring the widget always shows something.

## Expected impact

- **Accurate daily/weekly/bi-weekly counters** — from the tachograph unit, not approximated from 5-min polling
- **Correct extension count** — directly from `extended_driver_count`
- **Accurate continuous driving** — from `driverStatePerDriver` state transitions with second-level precision
- **Real-time current state** — from `current_state` instead of last sync snapshot
- **No database schema changes needed** — all data flows through the existing function interface
- **Graceful degradation** — falls back to current calculation if API is unavailable

