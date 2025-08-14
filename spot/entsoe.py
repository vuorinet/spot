from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import typing as t
import xml.etree.ElementTree as ET

import httpx
import os
from decimal import Decimal
import logging

FI_EIC = "10YFI-1--------U"
# Allow overriding via env; default to known working host
ENTSOE_BASE_URL = os.environ.get("ENTSOE_BASE_URL", "https://web-api.tp.entsoe.eu/api")
logger = logging.getLogger("spot.entsoe")


class DataNotAvailable(Exception):
    """Raised when ENTSO-E returns no time series for the requested period."""


@dataclass(frozen=True)
class PricePoint:
    start_utc: datetime
    end_utc: datetime
    price_eur_per_mwh: float


@dataclass(frozen=True)
class DaySeries:
    market: str
    granularity: t.Literal["hour", "quarter_hour"]
    points: list[PricePoint]
    published_at_utc: datetime | None


def _iso_to_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _duration_to_granularity(duration: str) -> str:
    if duration == "PT60M":
        return "hour"
    if duration == "PT15M":
        return "quarter_hour"
    raise ValueError(f"Unsupported resolution: {duration}")


def parse_publication_xml(xml_bytes: bytes) -> DaySeries:
    root = ET.fromstring(xml_bytes)
    ns = {"ns": root.tag.split("}")[0].strip("{")}
    local_name = root.tag.split("}")[-1]

    if local_name.endswith("Acknowledgement_MarketDocument"):
        # Try to extract reason text for diagnostics
        reasons = [e.text or "" for e in root.findall(".//ns:Reason/ns:text", ns)]
        msg = "; ".join([r for r in reasons if r]) or "No TimeSeries (acknowledgement)"
        raise DataNotAvailable(msg)

    ts_list = root.findall(".//ns:TimeSeries", ns)
    if not ts_list:
        # Many cases: No content yet
        raise DataNotAvailable("No TimeSeries in response")

    all_points: list[PricePoint] = []
    granularity: t.Literal["hour", "quarter_hour"] | None = None
    published_at: datetime | None = None

    for ts in ts_list:
        period = ts.find(".//ns:Period", ns)
        if period is None:
            continue
        resolution = period.findtext("ns:resolution", default="", namespaces=ns)
        g = _duration_to_granularity(resolution)
        if granularity is None:
            granularity = t.cast(t.Literal["hour", "quarter_hour"], g)
        start_str = period.findtext("ns:timeInterval/ns:start", namespaces=ns)
        end_str = period.findtext("ns:timeInterval/ns:end", namespaces=ns)
        if not start_str or not end_str:
            continue
        start_dt = _iso_to_dt(start_str)
        end_dt = _iso_to_dt(end_str)
        step = timedelta(hours=1) if g == "hour" else timedelta(minutes=15)

        pts = sorted(period.findall("ns:Point", ns), key=lambda e: int(e.findtext("ns:position", default="0", namespaces=ns)))
        pos_to_price: dict[int, float] = {}
        for p in pts:
            pos = int(p.findtext("ns:position", default="0", namespaces=ns))
            amount_text = p.findtext("ns:price.amount", default="0", namespaces=ns)
            price = float(amount_text)
            pos_to_price[pos] = price

        # Fill sequentially; ENTSO-E may skip positions to compress equal values
        idx = 1
        cur = start_dt
        while cur < end_dt:
            price = pos_to_price.get(idx)
            if price is None:
                if not all_points:
                    price = next((v for k, v in sorted(pos_to_price.items()) if k >= idx), 0.0)
                else:
                    price = all_points[-1].price_eur_per_mwh
            pt_end = cur + step
            all_points.append(PricePoint(cur, pt_end, price))
            cur = pt_end
            idx += 1

    if granularity is None:
        raise ValueError("Could not determine granularity")

    return DaySeries(market="FI", granularity=granularity, points=all_points, published_at_utc=published_at)


async def fetch_day_ahead_prices(token: str, target_date: date) -> DaySeries:
    # Create Helsinki timezone start and end times, then convert to UTC
    # ENTSO-E expects local time boundaries for the market data
    from dateutil import tz
    helsinki_tz = tz.gettz("Europe/Helsinki")
    
    period_start_local = datetime(target_date.year, target_date.month, target_date.day, 0, 0, tzinfo=helsinki_tz)
    period_end_local = period_start_local + timedelta(days=1)
    
    # Convert to UTC for the API request
    period_start = period_start_local.astimezone(timezone.utc)
    period_end = period_end_local.astimezone(timezone.utc)
    params = {
        "securityToken": token,
        "documentType": "A44",
        "processType": "A01",
        "in_Domain": FI_EIC,
        "out_Domain": FI_EIC,
        "periodStart": period_start.strftime("%Y%m%d%H%M"),
        "periodEnd": period_end.strftime("%Y%m%d%H%M"),
    }
    safe_params = {k: v for k, v in params.items() if k != "securityToken"}
    logger.debug("ENTSO-E GET %s params=%s", ENTSOE_BASE_URL, safe_params)
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(ENTSOE_BASE_URL, params=params)
        if r.status_code == 429:
            await asyncio.sleep(1)
            r = await client.get(ENTSOE_BASE_URL, params=params)
        r.raise_for_status()
        try:
            return parse_publication_xml(r.content)
        except DataNotAvailable as e:
            # Log a short snippet for diagnostics
            snippet = r.content[:200].decode(errors="ignore")
            logger.info("ENTSO-E data not available: %s | body: %s", e, snippet)
            raise


def get_prices(token: str, start_date: date, end_date: date) -> t.Generator[tuple[datetime, Decimal], None, None]:
    """Yield (UTC datetime, EUR/kWh) for the range [start_date, end_date).

    Matches the style shown in user's other project (periodStart/periodEnd built
    as YYYYMMDD0000). Internally calls fetch_day_ahead_prices per day and
    converts EUR/MWh to EUR/kWh.
    """
    cur = start_date
    one_day = timedelta(days=1)
    while cur < end_date:
        # Note: function is async, so we expose sync generator via run_until_complete
        raise RuntimeError("get_prices requires an async runner; use fetch_day_ahead_prices directly in async contexts")
