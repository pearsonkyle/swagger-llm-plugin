# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

`swagger-llm-ui` is a Python package that replaces FastAPI's default `/docs` page with an LLM-enhanced Swagger UI. It injects a settings panel, chat interface, and code export tools via Swagger UI plugins. Users configure LLM credentials in-browser; those are persisted in localStorage and forwarded as `X-LLM-*` headers on every API call.

## Commands

```bash
# Install with dev dependencies
pip install -e ".[dev]"

# Run all tests
pytest tests/

# Run a single test
pytest tests/test_plugin.py::test_name -v

# Run demo server
uvicorn examples.demo_server:app --reload
```

## Architecture

**Python backend** (`src/swagger_llm_ui/`):
- `plugin.py` — `setup_llm_docs(app)` removes default `/docs` and `/redoc` routes, mounts static files at `/swagger-llm-static`, registers a custom `/docs` route (Jinja2-rendered), and a `/llm-chat` proxy endpoint. Thread-safe via `threading.Lock`.
- `dependencies.py` — `LLMConfig` dataclass + `get_llm_config()` FastAPI dependency that extracts `X-LLM-*` headers from requests with type coercion and defaults.
- `__init__.py` — Public API: `setup_llm_docs`, `get_swagger_ui_html`, `LLMConfig`, `get_llm_config`.

**JavaScript plugins** (`src/swagger_llm_ui/static/`):
- `llm-settings-plugin.js` — Swagger UI plugin with Redux-style state management. Renders settings form, provider presets, connection tester, and chat panel. Persists to localStorage keys `swagger-llm-settings` and `swagger-llm-chat-history`.
- `llm-layout-plugin.js` — Wraps Swagger UI's BaseLayout with LLMSettingsPanel and tab navigation (API Explorer / Chat).
- `code-export-plugin.js` — OpenAPI schema parser and code generators (curl, Python httpx, JS fetch).

**Template** (`src/swagger_llm_ui/templates/swagger_ui.html`):
- Jinja2 template that loads Swagger UI from CDN, injects plugin scripts, embeds CSS (dark theme, provider badges), and configures the request interceptor that reads localStorage and adds `X-LLM-*` headers.

**Data flow**: Browser settings → localStorage → request interceptor → `X-LLM-*` headers → `get_llm_config()` dependency → endpoint logic. The `/llm-chat` endpoint proxies to the configured LLM backend with OpenAPI schema context as system prompt.

## Build System

- Hatchling (PEP 517). Static files and templates are force-included in wheel via `pyproject.toml`.
- Tests use pytest with `asyncio_mode = "auto"` and anyio for async support.

## Key Conventions

- LLM header names follow the pattern `X-LLM-{Field}` (e.g., `X-LLM-Base-Url`, `X-LLM-Api-Key`).
- Provider presets (OpenAI, Anthropic, Ollama, LM Studio, vLLM, Azure, Custom) are defined in the HTML template and JS plugin.
- The JS plugins use Swagger UI's plugin system (`statePlugins`, `components`, `wrapComponents`). They are plain JS (no build step, no JSX).
