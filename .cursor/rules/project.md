# Project Goals and Constraints

## Goals
- Present day-ahead spot electricity prices for today and tomorrow.
- Prioritize clarity, correctness (timezones/DST), and reliability.

## Constraints
- Do not implement code until the USER approves the plan and design.
- Record all product decisions in `RULES.md` (repo root) with dates and rationale.
- Prefer official APIs with acceptable ToS (avoid scraping public HTML).
- Accessibility target: WCAG 2.2 AA (MVP aims toward compliance).
- Tech stack: Python backend with HTMX UI. No Node.js toolchain or SPA framework.
- Data source: ENTSO-E Transparency Platform API (official). Token provided via `ENTSOE_API_TOKEN` env var.

## Users
- Consumers on spot contracts and power users optimizing load (Finland).

## Success Criteria (MVP)
- User can view Finland's prices for today and tomorrow.
- Tomorrow’s view handles “not yet published” gracefully.
- Correct handling of DST (23/25-hour days). UI shows times in the browser's local timezone; backend scheduling uses Europe/Helsinki.
