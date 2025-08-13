# CI/CD (GitHub Actions with self-hosted runner)

## Runner
- Self-hosted GitHub Actions runner registered at the organization level
- Runner has access to Docker daemon and write permissions to `/srv/spot`

## Secrets and env
- Use GitHub Environments to store `ENTSOE_API_TOKEN`
- Actions job exports secrets to `.env` in `/srv/spot` for `docker compose`

## Pipeline outline
- Triggers: push to `main`, manual dispatch
- Jobs:
  1. Build (GitHub-hosted): use `uv` for dependency resolution; build container image; tag and push as `:latest` (and optionally by SHA). Enable build cache (BuildKit/registry cache) to speed builds.
  2. Deploy (self-hosted):
     - Ensure `/srv/spot` exists with `docker-compose.yml`
     - Write/update `/srv/spot/.env` from environment secrets
     - `docker compose --project-directory /srv/spot pull`
     - `docker compose --project-directory /srv/spot up -d --force-recreate`

## Notes
- Keep compose minimal; mount nothing sensitive
- Do not print secrets in logs
- Prefer pinned image digests in compose (even if tagging `:latest`, resolve to digest at deploy if feasible)
- After deploy on self-hosted, optionally run `docker image prune -f` to remove dangling layers/images
