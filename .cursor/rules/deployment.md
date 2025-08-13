# Deployment (Low-powered Linux server, containerized)

## Target
- Raspberry Pi class device, 64-bit Linux preferred
- Container runtime: Docker (pre-installed on server)

## Runtime profile
- App server: uvicorn (ASGI) for FastAPI
- Reverse proxy: existing Nginx on host (TLS termination). Configure proxy pass, websocket upgrades, and forwarded headers.
- Cache: in-memory by default; Redis only if needed (watch RAM)

## Images
- Base: `ghcr.io/astral-sh/uv:python3.12-bookworm` preferred for fast, reproducible installs with `uv`
- Build wheels at build time; avoid dev toolchains at runtime
- Use multi-stage builds; run as non-root

## Config
- Environment variables: ENTSOE_API_TOKEN
- Health check endpoint: `/healthz`
- Resource limits: CPU quota and memory limit set at compose level
 - Configuration directory on server: `/srv/spot` (owned by deploy user; runner has write access)
 - Server timezone: assume Europe/Helsinki. Optionally set container env `TZ=Europe/Helsinki` to ensure logs/scheduler align.

## Observability
- Structured logs to stdout; rotate at host
- Basic metrics via `/metrics` (optional)

## Security
- Read-only filesystem where possible
- No privileged containers; drop capabilities
- Honor `X-Forwarded-Proto`, set `proxy_redirect off;`, and configure `proxy_set_header Upgrade`/`Connection` for websockets in Nginx
- CSP and strict headers on reverse proxy

## Release process
- CI (GitHub-hosted runner): build and tag image `spot:<version|sha>` and push to container registry
- CD (self-hosted server):
  - Ensure `/srv/spot` exists and contains `docker-compose.yml` and `.env`
  - `docker compose --project-directory /srv/spot pull`
  - `docker compose --project-directory /srv/spot up -d --force-recreate`
 - CI/CD: GitHub Environments provide `ENTSOE_API_TOKEN` secret; pipeline writes it to `/srv/spot/.env` so container receives the env var.

### CI/CD on self-hosted runner (outline)
- Runner writes files to `/srv/spot`:
  - `docker-compose.yml`
  - `.env` (contains ENTSOE_API_TOKEN and other envs)
- Execute:
  - `docker compose --project-directory /srv/spot up -d --force-recreate`

### Example docker-compose service env
```yaml
services:
  app:
    image: spot:${VERSION}
    environment:
      ENTSOE_API_TOKEN: ${ENTSOE_API_TOKEN}
      TZ: Europe/Helsinki
      DEFAULT_MARGIN_CENTS_PER_KWH: ${DEFAULT_MARGIN_CENTS_PER_KWH:-0}
```
 - Deployment allows brief downtime. Use `--force-recreate`; no blue/green required.
