# Project Rules

## Testing Rules
- **Never try to test the UI or start web servers for testing purposes**, as this always leads to getting stuck with hanging processes
- When functional behavior needs to be tested (like API endpoints, UI interactions, etc.), **ask the user to test it instead**
- Only test code compilation/syntax and basic Python imports, not runtime behavior

## Development Guidelines
- Focus on implementing the requested features correctly
- Provide clear instructions to the user for testing when needed
- Use static analysis and code review instead of runtime testing and Decisions

Source of truth for scope and decisions. This file must be kept up to date as the project evolves. All changes to scope or behavior must be reflected here.

## Invariants (must always hold)
- No implementation (coding) until the plan and design are approved by the USER.
- The product shows day-ahead spot electricity prices for today and tomorrow.
- Decisions are recorded here with date and rationale. Pending decisions are tracked until resolved.

## Decided Items
- 2025-08-13: Project name: "Spot is a dog". Python package name: `spot`. UI must display the full project name in the header.
- 2025-08-13: Create and maintain this rules file at `RULES.md` in repository root.
- 2025-08-13: Initial goal is a read-only viewer for spot prices covering today and tomorrow. (Details of regions, data source, units, stack are still pending.)
- 2025-08-13: Tech stack decided: Python backend with HTMX-based UI. No Node.js toolchain or SPA framework.
- 2025-08-13: Hosting decided: Containerized deployment on a low-powered Linux server (e.g., Raspberry Pi class device).
- 2025-08-13: Container runtime: Docker (already installed on server).
- 2025-08-13: Web framework: FastAPI (ASGI) selected.
- 2025-08-13: Reverse proxy: Existing Nginx will front the app with TLS; app must operate correctly behind a proxy (X-Forwarded-* honored) and support websockets if utilized.
- 2025-08-13: Primary data source: ENTSO-E Transparency Platform API (official). Use per ToS; include attribution.
- 2025-08-13: Caching strategy: In-memory application cache only (today/tomorrow). No Redis for MVP.
- 2025-08-13: Configuration: ENTSOE_API_TOKEN provided via environment variable (docker-compose), sourced from GitHub Environments secrets at deploy time.
- 2025-08-13: Fetching strategy: On startup, fetch required prices and retry until valid data is available. Daily polling starts shortly before 14:00 Europe/Helsinki to detect tomorrow's prices; poll at most once per minute; stop polling immediately after successful fetch. Provide a manual "Force refresh" action in the UI to bypass cache if needed.
- 2025-08-13: Market scope: Finland only (bidding zone FI). No multi-country support in MVP.
- 2025-08-13: Timezone scope: No user-selectable timezones or URL tz params. Internally store UTC; UI shows browser local time. Backend assumes server timezone is Europe/Helsinki for scheduling.
- 2025-08-13: UI composition: Two bar charts (today, tomorrow). Each chart has 24 bars (DST-aware). Each bar is stacked: spot component (color-coded) + margin component (dark grey) at the top. A vertical yellow line indicates the current time across today's chart; no time label required.
- 2025-08-13: Granularity: When ENTSO-E publishes 15-minute day-ahead prices, each chart shows 4×24 bars (DST-aware: 92 or 100 on DST days). Automatically switch to 15-minute granularity when available; otherwise show hourly.
- 2025-08-13: Units and taxes: Display prices in cents/kWh, including Finland VAT 25.5%. VAT is a fixed constant, defined in one place only.
 - 2025-08-13: Units and taxes: Display prices in cents/kWh, including Finland VAT 25.5%. VAT is a fixed constant, defined in one place only. No unit or tax toggles in UI.
- 2025-08-13: Color thresholds (configurable): Green < 5 c/kWh; Yellow 5–15 c/kWh; Red ≥ 15 c/kWh. Thresholds apply to the spot component (incl. VAT, excluding margin). Margin is always rendered in dark grey.
- 2025-08-13: Margin: Supplier margin represented as a fixed add-on in c/kWh (configurable). Rendered as the top segment of each stacked bar in dark grey.
 - 2025-08-13: Margin configuration: Margin is provided via URL query parameter (in c/kWh). On first visit, the app updates the URL to include a default margin from environment configuration so users can bookmark/share.
- 2025-08-13: Tooling: Use `uv` for Python (dependency management, locking, running). No `pip`/`venv` in CI unless via `uv`.
- 2025-08-13: CI/CD: CI builds the Docker image on GitHub-hosted runners and pushes to a container registry; CD runs on the self-hosted server, writes config and `docker-compose.yml` to `/srv/spot`, pulls the image, and runs `docker compose up -d --force-recreate`.
- 2025-08-13: Python code style: Use Ruff with strict rules; use Ruff formatter. Prefer procedural/functional style; classes only for data or clearly stateful behavior. Do not require docstrings; avoid useless comments. Always use type hints.
- 2025-08-13: Code quality: Follow clear naming, modular structure, and separation of concerns. Code must be easy to read and understand. Avoid boilerplate and unnecessary abstractions; every line must serve a purpose.
- 2025-08-13: Editor configuration: Add `.editorconfig` enforcing LF line endings, 4-space indentation, trimming trailing whitespace, and final newline at EOF.
- 2025-08-13: Formatting and charset: Use Ruff defaults for line length (88). Charset is UTF-8 everywhere. Do not use emojis/emoticons or decorative icons in code, comments, or logs.
- 2025-08-13: Container images: Only the latest image matters. Tag and deploy `:latest`. Use build cache to speed up CI builds. On the server, prune old/dangling images after deployment.
- 2025-08-13: UI theme: Dark mode only. No theme switcher. Ensure sufficient contrast for accessibility.
- 2025-08-13: UI background: Pure black (#000) to suit always-on displays.
- 2025-08-13: Keep-awake option: Provide an optional "Keep display always on" checkbox in the UI (Android tablets etc.). Use the Screen Wake Lock API when available; degrade gracefully if unsupported.
- 2025-08-13: Deployments: Allow brief downtime during upgrades; no blue/green or zero-downtime requirement.
- 2025-08-13: Auto-reload on deploy: The UI must automatically reload when a new version is deployed. Prefer Server-Sent Events (SSE) to notify clients of version changes; fall back to lightweight polling of a `/version` endpoint when SSE is unavailable.
- 2025-08-13: Layout target: Optimize UI for tablets and small devices first (single-column, touch-friendly). Desktop is secondary.
 - 2025-08-13: Layout: Two charts displayed side-by-side; left = today, right = tomorrow. On small tablets, ensure both remain legible.
 - 2025-08-13: Tomorrow not yet published: Show margin-only grey bars in the tomorrow chart (with a small note/countdown), since spot component is unknown at midnight.

## Pending Decisions (to be resolved)
 - Fallback data source strategy (redundancy if primary unavailable)
 - Supplier margin default value and configurability limits
 - Behavior before tomorrow’s prices are published (empty state, countdown, last-known cache)
 - Domain (if any) and hosting DNS configuration
 - Open-source license (e.g., MIT/Apache-2.0) and attribution requirements (per data source)
 - Analytics/telemetry (on/off by default; privacy stance and cookie policy)
 - Accessibility target (e.g., WCAG 2.2 AA)

## Definitions
- Day-ahead spot price: The hourly price for electricity delivered during a given hour, cleared on the day-ahead market, typically published early afternoon local CET/CEST for the following day.
- Price area / bidding zone: A geographic/electrical market area with its own hourly prices (e.g., FI, SE1-SE4).

## Data Licensing Notes (watch-outs)
- Nord Pool: Scraping or redistributing may be restricted by ToS; official data feeds require agreements.
- ENTSO-E: Free with registration; rate limits and attribution rules apply.
- National TSOs: Vary by country; often require free API keys and attribution.

## Change Log
- 2025-08-13: Initial creation of `RULES.md` with invariants and decision checklist.
