from __future__ import annotations

from datetime import UTC, timedelta

from spot.entsoe import (
    DaySeries,
    PricePoint,
    _simulate_15min_from_hourly,
    parse_publication_xml,
)

EXAMPLE_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<Publication_MarketDocument xmlns="urn:iec62325.351:tc57wg16:451-3:publicationdocument:7:0">
  <TimeSeries>
    <Period>
      <timeInterval>
        <start>2025-08-13T00:00Z</start>
        <end>2025-08-13T03:00Z</end>
      </timeInterval>
      <resolution>PT60M</resolution>
      <Point>
        <position>1</position>
        <price.amount>50.0</price.amount>
      </Point>
      <Point>
        <position>3</position>
        <price.amount>55.0</price.amount>
      </Point>
    </Period>
  </TimeSeries>
</Publication_MarketDocument>
"""


def test_parse_with_gaps_fills_prices():
    series = parse_publication_xml(EXAMPLE_XML)
    assert series.granularity == "hour"
    assert len(series.points) == 3
    assert series.points[0].price_eur_per_mwh == 50.0
    assert series.points[1].price_eur_per_mwh == 50.0  # gap filled
    assert series.points[2].price_eur_per_mwh == 55.0


EXAMPLE_15MIN_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<Publication_MarketDocument xmlns="urn:iec62325.351:tc57wg16:451-3:publicationdocument:7:0">
  <TimeSeries>
    <Period>
      <timeInterval>
        <start>2025-10-01T00:00Z</start>
        <end>2025-10-01T01:00Z</end>
      </timeInterval>
      <resolution>PT15M</resolution>
      <Point>
        <position>1</position>
        <price.amount>45.0</price.amount>
      </Point>
      <Point>
        <position>2</position>
        <price.amount>48.0</price.amount>
      </Point>
      <Point>
        <position>3</position>
        <price.amount>52.0</price.amount>
      </Point>
      <Point>
        <position>4</position>
        <price.amount>50.0</price.amount>
      </Point>
    </Period>
  </TimeSeries>
</Publication_MarketDocument>
"""


def test_parse_15_minute_resolution():
    """Test parsing 15-minute resolution data."""
    series = parse_publication_xml(EXAMPLE_15MIN_XML)
    assert series.granularity == "quarter_hour"
    assert len(series.points) == 4
    assert series.points[0].price_eur_per_mwh == 45.0
    assert series.points[1].price_eur_per_mwh == 48.0
    assert series.points[2].price_eur_per_mwh == 52.0
    assert series.points[3].price_eur_per_mwh == 50.0

    # Check that intervals are 15 minutes apart
    assert series.points[1].start_utc == series.points[0].start_utc + timedelta(
        minutes=15,
    )
    assert series.points[2].start_utc == series.points[1].start_utc + timedelta(
        minutes=15,
    )
    assert series.points[3].start_utc == series.points[2].start_utc + timedelta(
        minutes=15,
    )


def test_simulate_15min_from_hourly():
    """Test simulation of 15-minute data from hourly data."""
    from datetime import datetime

    # Create mock hourly data with 2 hours
    hourly_points = [
        PricePoint(
            datetime(2025, 9, 13, 10, 0, tzinfo=UTC),
            datetime(2025, 9, 13, 11, 0, tzinfo=UTC),
            50.0,
        ),
        PricePoint(
            datetime(2025, 9, 13, 11, 0, tzinfo=UTC),
            datetime(2025, 9, 13, 12, 0, tzinfo=UTC),
            60.0,
        ),
    ]

    hourly_data = DaySeries(
        market="FI",
        granularity="hour",
        points=hourly_points,
        published_at_utc=None,
    )

    # Simulate 15-minute data
    simulated = _simulate_15min_from_hourly(hourly_data)

    # Should have 8 intervals (2 hours * 4 quarters each)
    assert simulated.granularity == "quarter_hour"
    assert len(simulated.points) == 8

    # First hour should have 4 identical intervals with price 50.0
    for i in range(4):
        assert simulated.points[i].price_eur_per_mwh == 50.0
        expected_start = datetime(2025, 9, 13, 10, i * 15, tzinfo=UTC)
        expected_end = expected_start + timedelta(minutes=15)
        assert simulated.points[i].start_utc == expected_start
        assert simulated.points[i].end_utc == expected_end

    # Second hour should have 4 identical intervals with price 60.0
    for i in range(4, 8):
        assert simulated.points[i].price_eur_per_mwh == 60.0
        quarter_in_hour = i - 4
        expected_start = datetime(2025, 9, 13, 11, quarter_in_hour * 15, tzinfo=UTC)
        expected_end = expected_start + timedelta(minutes=15)
        assert simulated.points[i].start_utc == expected_start
        assert simulated.points[i].end_utc == expected_end
