# Repository Workflow

- Planning-first: no code until design approved by USER.
- Keep `RULES.md` updated for every decision.
- Prefer small PRs with clear summaries once coding begins.
- Include tests and attribution checks in CI.
- Use conventional commits style (e.g., feat:, fix:, docs:), unless project specifies otherwise.
- Python-only tooling (no Node.js). Use pytest for tests and Ruff for lint/format (strict configuration; docstrings not required and excluded from lint).
 - Secrets: define `ENTSOE_API_TOKEN` in GitHub Environments; CI injects it into `docker compose` environment for deployment.
 - Use `uv` for Python dependency management and execution (`uv pip install`, `uv run pytest`, `uvx ruff`, `uvx black`).
 - Self-hosted GitHub Actions runner (org-level) executes deployments.
