

# Fix: driverList blocks vehicle sync — restructure to non-blocking

## Problem

The logs confirm the issue: **no `[DRIVERLIST]` entries appear at all**, meaning the edge function times out (~60s wall clock) before the driverList fetch completes. The current `Promise.all` structure means vehicle processing is also blocked waiting for driverList, even though `vehiclesForUser` returns in seconds.

The 55s timeout + retry (up to 112s) far exceeds the edge function's execution limit.

## Solution

Restructure the code so driverList runs as a **fire-and-forget background promise** that doesn't block vehicle processing. Process vehicles immediately when `vehiclesForUser` returns, then apply driverList data only if it arrives in time.

### Changes to `supabase/functions/sync-trackit-data/index.ts`

1. **Don't await driverList in Promise.all** — fire the fetch but don't block on it
2. **Reduce timeout to 25s** (no retry) — if it doesn't respond in 25s within a single edge function run, it won't respond at all
3. **Process vehicles first**, then check if driverList resolved
4. **Apply driverList data after vehicle upserts** if available

```typescript
// Fire driverList in background (don't block vehicle processing)
const driverListPromise = fetchWithRetry(
  "https://i.trackit.pt/ws/driverList",
  { headers: { Authorization: `Basic ${credentials}` } },
  25000, // 25s — must fit within edge function wall clock
  0      // No retry — single attempt
).then(async (res) => {
  if (!res || !res.ok) return [];
  const json = await res.json();
  const data = json.data || json || [];
  console.log(`[DRIVERLIST] ${client.name}: fetched ${data.length} drivers`);
  return data;
}).catch(() => []);

// Fetch vehicles (fast, ~2-5s)
const trackitResponse = await fetch("https://i.trackit.pt/ws/vehiclesForUser", { ... });

// ... process all vehicles immediately ...

// After vehicle processing, check if driverList arrived
const driverListData = await Promise.race([
  driverListPromise,
  new Promise<any[]>(r => setTimeout(() => r([]), 5000)) // 5s grace after vehicles done
]);

// Apply tacho compliance data if we got it
if (driverListData.length > 0) { /* existing match logic */ }
```

This ensures:
- Vehicles are always processed (the core sync function)
- driverList data is applied as a bonus if the API responds in time
- The function never times out waiting for driverList

