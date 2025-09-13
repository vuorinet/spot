# Spot is a dog

Finland day-ahead spot electricity price viewer for today and tomorrow.

-   Finland-only (bidding zone FI)
-   Units: cents/kWh including VAT 25.5% (fixed)
-   Supplier margin: configurable via URL query parameter `?margin=<cents_per_kWh>`
-   Two stacked bar charts side-by-side: left = today, right = tomorrow
    -   Spot portion color-coded: green < 5, yellow 5–15, red ≥ 15 c/kWh
    -   Margin always dark grey, stacked on top
    -   Vertical yellow line indicates current time
-   Supports hourly and 15-minute prices; automatically switches to 15-minute resolution for dates after October 1, 2025; handles DST days (23/25 hours, 92/100 quarters)
-   Dark-only UI with a pure black background

## Running locally (Python + uv)

Prerequisites:

-   Python 3.12+
-   `uv` installed (see `https://github.com/astral-sh/uv`)

1. Install dependencies (creates `.venv/`):

```bash
uv sync --dev
```

2. Set environment variables (shell example):

```bash
export ENTSOE_API_TOKEN="<your_entsoe_token>"
export DEFAULT_MARGIN_CENTS_PER_KWH=0
export SPOT_VERSION=dev
# Optional: override ENTSO-E base URL if needed
# export ENTSOE_BASE_URL=https://web-api.tp.entsoe.eu/api
```

How to get ENTSO-E token: register at the [ENTSO-E Transparency Platform](https://transparency.entsoe.eu/), generate an API token, and use it as `ENTSOE_API_TOKEN`.

3. Run the server (with logs):

```bash
export LOG_LEVEL=INFO  # or DEBUG for more verbosity
uv run uvicorn spot.main:create_app --factory --host 0.0.0.0 --port 8000 --proxy-headers --log-level info
```

Open: `http://localhost:8000`

-   Add `?margin=3.2` (c/kWh) to the URL to include your contract margin. If the `margin` param is missing on first visit, the app updates the URL to include the default margin from `DEFAULT_MARGIN_CENTS_PER_KWH` so you can bookmark it.

## Running with Docker

Prerequisites:

-   Docker and Docker Compose

1. Create `.env` file (not committed) next to `docker-compose.yml`:

```env
ENTSOE_API_TOKEN=<your_entsoe_token>
DEFAULT_MARGIN_CENTS_PER_KWH=0
SPOT_VERSION=dev
LOG_LEVEL=INFO
# Optional override if DNS issues occur
# ENTSOE_BASE_URL=https://web-api.tp.entsoe.eu/api
```

2. Build and start:

```bash
docker compose up -d --build
```

Open: `http://localhost:8000`

### Debugging startup issues

-   If the server appears stuck on "Waiting for application startup", enable debug logging:
    -   Set `LOG_LEVEL=DEBUG`
    -   Uvicorn flag `--log-level debug`
-   Watch for lines like:
    -   `Starting app: Spot is a dog`
    -   `Startup fetch attempt (backoff=...)` and `Startup fetch succeeded; cache is warm`
    -   `Fetching today's prices ...` / `Attempting to prefetch tomorrow's prices ...`
-   If ENTSO-E is unreachable or token invalid, you will see exception logs during startup backoff retries.

## Tests

```bash
uv sync --dev
./.venv/bin/pytest -q
```

## 15-Minute Resolution Support

Starting October 1, 2025, the European Single Day-Ahead Coupling (SDAC) will transition to 15-minute Market Time Units (MTU). This application automatically:

-   **Detects the transition**: For dates on or after October 1, 2025, the app attempts to fetch 15-minute resolution data first
-   **Falls back gracefully**: If 15-minute data is not available, it automatically falls back to hourly data
-   **Adapts the UI**: Charts automatically display 96 intervals (15-minute) instead of 24 (hourly) when 15-minute data is available
-   **Maintains compatibility**: All existing functionality continues to work with both hourly and 15-minute data
-   **Testing ready**: For current dates, the system simulates 15-minute data by expanding hourly data into 4 identical 15-minute intervals per hour

### Technical Details

-   **API Integration**: The ENTSO-E API integration tries to fetch the finest available resolution for each date
-   **Data Processing**: The system handles both `PT60M` (hourly) and `PT15M` (15-minute) resolution data
-   **UI Adaptation**: Charts automatically adjust X-axis labels and spacing based on data granularity
-   **Cache Management**: Cache validation logic accounts for different expected interval counts (24 vs 96)
-   **Simulation Mode**: For testing, the system currently simulates 15-minute data for current dates. This can be disabled by modifying the date condition in `fetch_prices_for_day()`

## Notes

-   The service runs behind Nginx with TLS in production. For Server-Sent Events (SSE) used by the version auto-reload, ensure your reverse proxy is configured to pass through `text/event-stream` with appropriate buffering disabled.
-   The backend assumes server time zone `Europe/Helsinki` for scheduling ENTSO-E polling; the UI shows times in the browser's local time zone.
