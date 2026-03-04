

# Fix: `sync-trackit-data` boot failure — duplicate `allPlates` declaration

## Problem
The edge function crashes on boot with: `Identifier 'allPlates' has already been declared` at line 1255 (compiled).

There are two `const allPlates` declarations in the same scope:
- **Line 308**: `const allPlates = vehicleRecords.map(...)` (pre-fetch card_events)
- **Line 1223**: `const allPlates = vehicleRecords.map(...)` (orphan session cleanup)

## Fix
Rename the second declaration at line 1223 to `const allPlatesForOrphans` (or simply reuse the existing `allPlates` since both compute the same value).

**Simplest approach**: Remove the duplicate at line 1223 and reuse the `allPlates` already declared at line 308 (both produce identical results — `vehicleRecords.map(r => r.plate)`).

**File**: `supabase/functions/sync-trackit-data/index.ts`, line 1223

```typescript
// BEFORE:
const allPlates = vehicleRecords.map((r: any) => r.plate);

// AFTER (just remove the const — allPlates already exists):
// reuse allPlates from line 308
```

Single line change, no logic impact.

