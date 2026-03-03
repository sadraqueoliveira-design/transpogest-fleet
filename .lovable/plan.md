

# Increase driverList timeout to 55s + add automatic retry

## Changes

**File: `supabase/functions/sync-trackit-data/index.ts`**

Replace the single `driverList` fetch (lines 55-61) with a helper that retries once on failure, using a 55s timeout per attempt:

```typescript
// Helper: fetch with retry
async function fetchWithRetry(url: string, opts: RequestInit, timeoutMs: number, retries = 1): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      console.warn(`[DRIVERLIST] attempt ${attempt + 1}: HTTP ${res.status}`);
    } catch (e: any) {
      console.warn(`[DRIVERLIST] attempt ${attempt + 1} failed: ${e.message || e}`);
    }
    if (attempt < retries) {
      console.log(`[DRIVERLIST] retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return null;
}
```

In the parallel fetch block, replace the driverList call:
```typescript
fetchWithRetry(
  "https://i.trackit.pt/ws/driverList",
  { headers: { Authorization: `Basic ${credentials}` } },
  55000, // 55s timeout
  1      // 1 retry
)
```

This gives 2 total attempts (55s + 2s wait + 55s = 112s max), but since it runs in parallel with vehiclesForUser, the retry only fires if the first attempt fails quickly (timeout/network error). The overall function still completes within the edge function limit because the retry happens concurrently with vehicle data processing.

