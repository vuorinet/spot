# Architecture Preferences

## Recommended
- Python web app (FastAPI) with server-rendered templates (Jinja2)
  and HTMX for progressive enhancement and partial updates
- Endpoints:
  - `GET /` renders the full page (today/tomorrow charts)
  - `GET /partials/prices?date=YYYY-MM-DD` returns an HTML fragment for HTMX swaps
  - `GET /api/prices?date=YYYY-MM-DD` returns normalized JSON (optional)
  - URL query `margin` (in c/kWh) is read from the request; if absent, the app injects `?margin=<DEFAULT_MARGIN_CENTS_PER_KWH>` into the URL on first visit for bookmarking.
- Caching: in-memory cache on the app process only. Short TTL for "today"; cache "tomorrow" until next publish cutoff, then refresh.
- Time handling in UTC internally; render using browser local time in the UI. Backend scheduling assumes Europe/Helsinki; service always serves Finland (FI) prices regardless of client location.
- No Node.js toolchain or bundlers. Use vanilla CSS or a lightweight prebuilt CSS library.
- App runs behind an existing Nginx reverse proxy with TLS. Honor `X-Forwarded-Proto`, `X-Forwarded-For`, and
  websocket upgrade headers. Ensure ASGI server supports websockets (uvicorn does) if used by HTMX extensions.
- Configuration: read `ENTSOE_API_TOKEN` from environment. Fail fast at startup if missing.
- Proxy awareness: enable ProxyHeadersMiddleware or equivalent; configure uvicorn with `--proxy-headers`.
- Startup behavior: on process start, fetch today's and tomorrow's prices (if available). Retry with backoff until valid data present in cache. Support both hourly and quarter-hourly datasets transparently.
- Scheduler: lightweight in-process scheduler to begin polling shortly before 14:00 Europe/Helsinki at 1/min for tomorrow's prices; stop polling upon success.
- Versioning: expose `/version` that returns the running app version (e.g., image SHA). Provide `/events/version` SSE stream that emits on version changes so clients can auto-reload. Fallback: client polls `/version` every 60s.

## Alternatives
- Flask is possible but FastAPI is the selected default.
- Background jobs: APScheduler for scheduled refreshes around publish times. Avoid Redis/Celery unless requirements grow.
- Hosting: containerized on a low-powered Linux server (Raspberry Pi class) using Docker. Avoid heavy stacks. Use uvicorn as ASGI server. Nginx provided by host.

## Operational Requirements
- Logs with correlation IDs; upstream error mapping
- Rate limiting and backoff for upstream calls
- Automated synthetic check around publish time window
 - Resource efficiency: keep memory/CPU low; avoid unnecessary background workers.
