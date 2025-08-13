# syntax=docker/dockerfile:1.7-labs
FROM ghcr.io/astral-sh/uv:python3.12-bookworm AS base
WORKDIR /app
COPY pyproject.toml ./
RUN uv pip install --system --no-cache .
COPY spot ./spot
COPY templates ./templates
COPY static ./static
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
ENV TZ=Europe/Helsinki
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "spot.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
