from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import os
import typing as t

import httpx
from dateutil import tz
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from fastapi.templating import Jinja2Templates

ENTSOE_API_TOKEN = os.environ.get("ENTSOE_API_TOKEN")
DEFAULT_MARGIN_CENTS_PER_KWH = float(os.environ.get("DEFAULT_MARGIN_CENTS_PER_KWH", "0"))
VAT_RATE = 0.255
HELSINKI_TZ = tz.gettz("Europe/Helsinki")

@dataclass(frozen=True)
class PriceInterval:
    start_utc: datetime
    end_utc: datetime
    price_eur_per_mwh: float

@dataclass(frozen=True)
class DayPrices:
    market: str
    granularity: t.Literal["hour", "quarter_hour"]
    intervals: list[PriceInterval]
    published_at_utc: datetime | None

@dataclass
class Cache:
    today: DayPrices | None = None
    tomorrow: DayPrices | None = None
    last_refresh_utc: datetime | None = None

cache = Cache()

class ProxyHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        # Respect X-Forwarded-Proto for URL generation
        xf_proto = request.headers.get("x-forwarded-proto")
        if xf_proto:
            scope = request.scope
            scope["scheme"] = xf_proto
        response = await call_next(request)
        return response


def create_app() -> FastAPI:
    if not ENTSOE_API_TOKEN:
        raise RuntimeError("ENTSOE_API_TOKEN is required")

    app = FastAPI(title="Spot is a dog")

    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(ProxyHeadersMiddleware)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])

    templates = Jinja2Templates(directory="templates")
    app.mount("/static", StaticFiles(directory="static"), name="static")

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/version")
    async def version() -> dict[str, str]:
        return {"version": os.environ.get("SPOT_VERSION", "dev")}

    @app.get("/events/version")
    async def version_events() -> StreamingResponse:
        async def eventgen():
            while True:
                ver = os.environ.get("SPOT_VERSION", "dev")
                yield f"data: {{\"version\": \"{ver}\"}}\n\n"
                await asyncio.sleep(30)
        return StreamingResponse(eventgen(), media_type="text/event-stream")

    from .entsoe import fetch_day_ahead_prices

    async def fetch_prices_for_day(target_date: date) -> DayPrices:
        ds = await fetch_day_ahead_prices(ENTSOE_API_TOKEN, target_date)
        intervals = [PriceInterval(p.start_utc, p.end_utc, p.price_eur_per_mwh) for p in ds.points]
        return DayPrices(market=ds.market, granularity=ds.granularity, intervals=intervals, published_at_utc=ds.published_at_utc)

    async def ensure_cache_now() -> None:
        # Minimal: populate today and attempt tomorrow
        now_hel = datetime.now(tz=HELSINKI_TZ)
        today_d = now_hel.date()
        if cache.today is None or cache.today.intervals[0].start_utc.date() != today_d:
            cache.today = await fetch_prices_for_day(today_d)
        if cache.tomorrow is None:
            cache.tomorrow = await fetch_prices_for_day(today_d + timedelta(days=1))
        cache.last_refresh_utc = datetime.now(timezone.utc)

    @app.get("/", response_class=HTMLResponse)
    async def home(request: Request, margin: float | None = Query(default=None)) -> HTMLResponse:
        # Normalize margin via URL injection if missing (handled client-side)
        await ensure_cache_now()
        return templates.TemplateResponse("index.html", {
            "request": request,
            "app_name": "Spot is a dog",
            "margin_cents": margin if margin is not None else DEFAULT_MARGIN_CENTS_PER_KWH,
        })

    @app.get("/api/prices", response_class=JSONResponse)
    async def api_prices(date_str: str) -> JSONResponse:
        target = datetime.fromisoformat(date_str).date()
        dp = await fetch_prices_for_day(target)
        return JSONResponse({
            "market": dp.market,
            "granularity": dp.granularity,
            "intervals": [
                {
                    "startTimeUtc": it.start_utc.isoformat(),
                    "endTimeUtc": it.end_utc.isoformat(),
                    "priceAmount": it.price_eur_per_mwh,
                    "priceCurrency": "EUR",
                    "unit": "MWh",
                } for it in dp.intervals
            ],
        })

    def eur_mwh_to_cents_kwh(eur_per_mwh: float) -> float:
        # 1 MWh = 1000 kWh; EUR/MWh to EUR/kWh then to cents; include VAT
        eur_per_kwh = eur_per_mwh / 1000.0
        cents_per_kwh = eur_per_kwh * 100.0
        with_vat = cents_per_kwh * (1.0 + VAT_RATE)
        return with_vat

    def color_for_spot_cents(spot_cents: float) -> str:
        if spot_cents < 5.0:
            return "green"
        if spot_cents < 15.0:
            return "yellow"
        return "red"

    def build_view_model(dp: DayPrices, margin_cents: float) -> dict[str, t.Any]:
        entries: list[dict[str, t.Any]] = []
        for it in dp.intervals:
            spot_cents = eur_mwh_to_cents_kwh(it.price_eur_per_mwh)
            total_cents = max(0.0, spot_cents) + max(0.0, margin_cents)
            entries.append({
                "startUtc": it.start_utc,
                "endUtc": it.end_utc,
                "spotCents": spot_cents,
                "marginCents": margin_cents,
                "totalCents": total_cents,
                "color": color_for_spot_cents(spot_cents),
            })
        max_total = max((e["totalCents"] for e in entries), default=1.0) or 1.0
        return {"entries": entries, "maxTotal": max_total, "granularity": dp.granularity}

    @app.get("/partials/prices", response_class=HTMLResponse)
    async def partial_prices(request: Request, date: str, margin: float | None = None) -> HTMLResponse:
        margin_cents = margin if margin is not None else DEFAULT_MARGIN_CENTS_PER_KWH
        now_hel = datetime.now(tz=HELSINKI_TZ)
        base_date = now_hel.date()
        if date == "today":
            dp = cache.today or await fetch_prices_for_day(base_date)
        elif date == "tomorrow":
            dp = cache.tomorrow
            if dp is None:
                # Build margin-only skeleton for tomorrow
                start_utc = datetime.combine(base_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
                intervals = [
                    PriceInterval(start_utc + i * timedelta(hours=1), start_utc + (i + 1) * timedelta(hours=1), 0.0)
                    for i in range(24)
                ]
                dp = DayPrices(market="FI", granularity="hour", intervals=intervals, published_at_utc=None)
        else:
            try:
                target = datetime.fromisoformat(date).date()
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(status_code=400, detail="Invalid date") from exc
            dp = await fetch_prices_for_day(target)

        vm = build_view_model(dp, margin_cents)
        return templates.TemplateResponse("partials/prices.html", {
            "request": request,
            "vm": vm,
        })

    async def startup_tasks():
        # Initial fetch with retry/backoff until we have today's data
        backoff = 10
        while True:
            try:
                await ensure_cache_now()
                if cache.today is not None:
                    break
            except Exception:
                pass
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 300)

        async def poll_for_tomorrow_loop():
            while True:
                now = datetime.now(tz=HELSINKI_TZ)
                # Start polling from 13:50 to 14:30 if tomorrow not yet present
                if (now.hour == 13 and now.minute >= 50) or (now.hour == 14 and cache.tomorrow is None):
                    try:
                        cache.tomorrow = await fetch_prices_for_day((now + timedelta(days=1)).date())
                    except Exception:
                        pass
                    await asyncio.sleep(60)
                else:
                    await asyncio.sleep(30)

        asyncio.create_task(poll_for_tomorrow_loop())

    @app.on_event("startup")
    async def _on_startup() -> None:  # noqa: D401
        await startup_tasks()

    return app
