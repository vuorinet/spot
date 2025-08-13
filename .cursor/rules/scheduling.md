# Scheduling and Polling Rules

## Startup fetch
- On app start, attempt to fetch today's and (if published) tomorrow's prices from ENTSO-E.
- If fetch fails or data invalid, retry with exponential backoff until valid data is in cache.
- Backoff policy suggestion: start at 10s, cap at 5 minutes.

## Daily publication window (Finland only)
- ENTSO-E typically publishes the next day around 14:00 Europe/Helsinki (variable).
- Begin a light polling loop shortly before 14:00 Europe/Helsinki (e.g., 13:50) at most once per minute.
- On successful retrieval of tomorrow's complete dataset, stop polling immediately.
- Resume polling the next day at the same window.

## Manual refresh
- Expose a manual "Force refresh" action that triggers an immediate fetch ignoring cached entries (still rate-limit to be polite).

## Resource efficiency
- Keep the scheduler in-process and lightweight. No external broker. Ensure it survives worker restarts.

## Time handling
- Use Europe/Helsinki to compute the 14:00 local window and handle DST transitions. Assume the server runs with Europe/Helsinki timezone.
