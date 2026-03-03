

# ✅ DONE: driverList non-blocking restructure

## What changed
- driverList now fires as a background promise (25s timeout, no retry) 
- Vehicle processing happens immediately without waiting for driverList
- After vehicle upserts, a `Promise.race` gives driverList 5s grace to resolve
- If driverList doesn't arrive in time, vehicles are still fully synced — compliance data is applied as a bonus
