# Security and Privacy

- Do not expose API tokens client-side. Use server-side proxy only.
- Enforce rate limiting and input validation on API endpoints.
- Set CSP, Referrer-Policy, and other security headers.
- No tracking by default; any analytics must be explicit opt-in.
- Store minimal logs without PII; rotate and secure.
 - Treat `ENTSOE_API_TOKEN` as sensitive: never log it, never echo in errors, and do not write to files.
 - Honor forwarded headers to reconstruct original scheme/host for absolute URLs; avoid leaking internal addresses.
