from __future__ import annotations

from datetime import datetime, timezone

from spot.entsoe import parse_publication_xml

EXAMPLE_XML = b"""
<?xml version="1.0" encoding="UTF-8"?>
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
