# Data Sources and Normalization

## Primary (decided)
- ENTSO-E Transparency Platform API for day-ahead market prices (Finland only, bidding zone `FI`)
  - Token provided via `ENTSOE_API_TOKEN` env var (docker-compose). Do not expose client-side.
  - Adhere to rate limits and attribution requirements
  - Wide regional coverage; predictable publish time

## Fallbacks (future)
- National TSO APIs (e.g., Fingrid for Finland) if needed

## Normalized Model
- `market: "FI"` (constant)
- `granularity: "hour" | "quarter_hour"`
- `intervals: Array<{ startTimeUtc: ISO8601, endTimeUtc: ISO8601, priceAmount: number, priceCurrency: string, unit: "MWh" }>`
- Metadata: `publishedAtUtc`, `timezone`, `source`, `notes`

## Conversions
- c/kWh = (EUR/MWh) / 10
- VAT: include Finland's VAT 25.5% (single constant in one place)
- Margin: add fixed supplier margin (c/kWh) on top of the spot price for display and daily average; color thresholds apply to spot portion only

## ENTSO-E XML parsing rules
- Resolution: detect from `Period/resolution` (e.g., `PT60M` or `PT15M`) and set `granularity` accordingly.
- Multiple TimeSeries: if multiple series are returned for the same market day, merge them by time, preferring later series when overlaps occur.
- Point positions: sort `Point` entries by `position`. If positions are non-contiguous (gaps), repeat the last known price to fill missing positions until the next explicit point. This accounts for compressed ranges when consecutive prices are the same.
- Expand into concrete intervals using `timeInterval/start` and `resolution`.
- Validate the final count equals expected slots for the day considering DST (23/24/25 hours for hourly; 92/96/100 for quarter-hourly). Fail fast or refetch if counts mismatch.
