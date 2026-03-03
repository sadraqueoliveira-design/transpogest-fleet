

# Research: Trackit API — Single Driver Compliance Endpoint

## Findings

The **official Trackit API documentation** (both the online version at `trackit.targatelematics.com/manual/api.php` and the PDF manual v1.10) does **NOT** document the following endpoints that we currently use:

- `/ws/driverList` — undocumented/internal
- `/ws/driverStatePerDriver/{did}` — undocumented/internal

### Documented endpoints (complete list):
| Endpoint | Purpose |
|----------|---------|
| `/ws/vehiclesForUser` | All vehicles with live telemetry |
| `/ws/events` | Event history per vehicle (by MID) |
| `/ws/vehicleHistoric` | Point-by-point GPS history |
| `/ws/vehicleTravels` | Trip summaries |
| `/ws/ecodrive/driver/list` | Ecodrive KPIs per driver (not tacho) |
| `/ws/ecodrive/driver/detail` | Single driver ecodrive detail |
| `/ws/report/{lang}` | Generate reports (PDF/XLS) |

**None of these provide tachograph compliance data** (driving times, rest periods, continuous driving). The ecodrive endpoints provide fuel/speed KPIs, not EU 561/2006 compliance counters.

### No per-driver filter exists
The `/ws/driverList` endpoint (undocumented) returns **all drivers for the account** — there is no documented query parameter to filter by MID, driver UID, or card number. This is why it takes 45+ seconds for accounts with hundreds of drivers.

## Recommendation

Since there is no alternative single-driver endpoint, the current caching strategy is already the best approach:

1. **`sync-trackit-data`** (every 5 min) fetches `/ws/driverList` in parallel with vehicle data and caches `tacho_compliance` in `vehicles.tachograph_status`
2. **`check-driving-limits`** reads the cached data (if <15 min old) instead of making a live API call

This avoids the 45s+ latency of `/ws/driverList` at query time. The only improvement would be to ensure the sync function's `driverList` fetch succeeds more reliably (it currently has a 45s timeout and often fails for large accounts).

### Possible optimization: Use the `/ws/report` endpoint
The report API accepts `driverIdList` and could potentially generate a tachograph compliance report for a single driver. However, it returns a file blob (PDF/XLS), not structured JSON — parsing it would be fragile and slow.

**Conclusion**: No better endpoint exists. The current cache-based approach is optimal given the API constraints.

