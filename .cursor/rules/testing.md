# Testing Strategy

Use pytest as the primary test framework. Enforce type hints and run Ruff (strict) in CI.

## Unit
- Timezone conversion and DST edge cases (23/25 hours)
- Unit conversions and rounding behavior

## Integration/Contract
- API normalization of upstream data
- Handling of upstream 429/5xx with retries/backoff
- Scheduler logic: verifies polling starts before 14:00 Europe/Helsinki, runs at ~1/min, and stops on success
- Startup fetch retries until valid cache present
- Version endpoints: `/version` returns version string; SSE at `/events/version` emits on change. Client reloads after notification.

## E2E
- Region change, today/tomorrow navigation, empty states
- Visual regression for chart and table
- Manual Force Refresh triggers a fetch and updates UI when valid
- Auto-reload toast appears on new version and page reloads after grace period; user can trigger reload immediately.
