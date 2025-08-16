# Repository Workflow

- Planning-first: no code until design approved by USER.
- Keep `RULES.md` updated for every decision.
- Prefer small PRs with clear summaries once coding begins.
- Include tests and attribution checks in CI.
- Use conventional commits style (e.g., feat:, fix:, docs:), unless project specifies otherwise.
- **Git commits and pushes: Only perform `git commit` and `git push` when explicitly requested by the USER. Do not commit or push automatically after making changes. When USER says "commit", only do `git commit`. When USER says "push", only do `git push`. Both operations require separate explicit requests.**
- Python-only tooling (no Node.js). Use pytest for tests and Ruff for lint/format (strict configuration; docstrings not required and excluded from lint).
 - Secrets: define `ENTSOE_API_TOKEN` in GitHub Environments; CI injects it into `docker compose` environment for deployment.
 - Use `uv` for Python dependency management and execution (`uv pip install`, `uv run pytest`, `uvx ruff`, `uvx black`).
 - Self-hosted GitHub Actions runner (org-level) executes deployments.
