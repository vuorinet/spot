# UX Principles and Key States

## Principles
- Clarity over density; readable values and units
- Immediate answer: current hour, daily average, cheapest hours
- Accessible by default: keyboard and screen-reader friendly
- Color-blind friendly: ensure spot color scale (green/yellow/red) has sufficient luminance contrast; margin always dark grey.
- Dark-only theme: no theme switcher; ensure WCAG-compliant contrast in dark palette.
- Background is pure black (#000); avoid large bright surfaces to reduce power and glare on always-on displays.
- Tablet-first: optimize for 8–11" tablets and small screens (touch targets ≥ 44px, single-column layout, large typography). Desktop layout is a progressive enhancement.

## Key Screens/States
- Header shows full project name: "Spot is a dog".
- Two charts side-by-side: left = today, right = tomorrow. On narrow screens, ensure both are readable (responsive scaling).
- Today chart: hourly (24 bars, or 23/25 on DST) or quarter-hourly (4×24 bars; 92/100 on DST). Each bar is stacked: spot (color-coded) + margin (dark grey on top). A vertical yellow line indicates current time and intersects the corresponding bar.
- Tomorrow chart: same structure; if not yet published, render margin-only grey bars and show a small note/countdown.
- Errors: friendly message, retry, last update timestamp

## Controls
- Today/Tomorrow toggle
- Shareable URL with date (no timezone parameter)
- Manual "Force refresh" button that triggers a fresh fetch from ENTSO-E and replaces cached data when valid
- Keep-awake checkbox: when enabled, request a wake lock (Screen Wake Lock API) to prevent display sleep where supported. Show a tooltip about browser/device support and battery implications.
- Auto-reload behavior: when a new version is detected (via SSE or polling), show a small non-intrusive toast "New version available" with a 5-second countdown, then reload automatically. Provide a "Reload now" button.
- Margin in URL: if `?margin=` is absent, the app updates the URL with the default margin so users can bookmark/share their contract-specific margin.
