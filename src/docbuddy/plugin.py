"""Core plugin logic: functions to mount the custom LLM-enhanced Swagger UI docs."""

import re
import threading
import weakref
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.routing import Route


# Locate package static/template directories
_PACKAGE_DIR = Path(__file__).parent
_STATIC_DIR = _PACKAGE_DIR / "static"
_TEMPLATES_DIR = _PACKAGE_DIR / "templates"

# Thread-safe lock for route modification operations
_route_lock = threading.Lock()

# Track which apps have LLM docs setup to avoid duplicate routes
_llm_apps: weakref.WeakSet = weakref.WeakSet()

# Module-level Jinja2 environment (reused across requests)
_jinja_env = Environment(loader=FileSystemLoader(str(_TEMPLATES_DIR)), autoescape=True)

# Security headers middleware - added to app in setup_docs
_SECURITY_HEADERS_ADDED = "_docbuddy_security_headers_added"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Content Security Policy - allows same-origin and localhost for LLM connections
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
            "img-src 'self' data:; "
            "font-src 'self' data:; "
            f"connect-src 'self' {request.url.hostname}:* http://localhost:* https://*;"
        )

        response.headers["Content-Security-Policy"] = csp
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=()"

        return response


def get_swagger_ui_html(
    *,
    openapi_url: str,
    title: str,
    swagger_js_url: str = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui-bundle.js",
    swagger_css_url: str = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui.css",
    swagger_js_sri: str = "sha384-NXtFPpN61oWCuN4D42K6Zd5Rt2+uxeIT36R7kpXBuY9tLnZorzrJ4ykpqwJfgjpZ",
    swagger_css_sri: str = "sha384-rcbEi6xgdPk0iWkAQzT2F3FeBJXdG+ydrawGlfHAFIZG7wU6aKbQaRewysYpmrlW",
    theme_css_url: str = "/docbuddy-static/themes/light-theme.css",
    debug: bool = False,
    version: Optional[str] = None,
) -> HTMLResponse:
    """Return an HTMLResponse with the custom Swagger UI + LLM settings panel.

    This is the lower-level helper for users who want to serve the page manually.
    Most users should use :func:`setup_docs` instead.

    Args:
        openapi_url: URL of the OpenAPI JSON schema.
        title: Page title.
        swagger_js_url: CDN URL for Swagger UI JS.
        swagger_css_url: CDN URL for the Swagger UI CSS.
        swagger_js_sri: SRI hash for the Swagger UI JS bundle.
        swagger_css_sri: SRI hash for the Swagger UI CSS.
        theme_css_url: URL for the theme CSS file.
        debug: If True, disables template caching for development.
    """
    env = _jinja_env

    # Disable cache if in debug mode
    if debug:
        env.auto_reload = True
        if env.cache is not None:
            env.cache.clear()

    # Import version here to avoid circular import with __init__.py
    from importlib.metadata import version as get_version, PackageNotFoundError

    try:
        pkg_version = get_version("docbuddy")
    except PackageNotFoundError:
        pkg_version = "unknown"

    template = env.get_template("swagger_ui.html")
    html = template.render(
        title=title,
        openapi_url=openapi_url,
        swagger_js_url=swagger_js_url,
        swagger_css_url=swagger_css_url,
        swagger_js_sri=swagger_js_sri,
        swagger_css_sri=swagger_css_sri,
        theme_css_url=theme_css_url,
        version=version or pkg_version,
    )
    return HTMLResponse(html)


def setup_docs(
    app: FastAPI,
    *,
    docs_url: str = "/docs",
    title: Optional[str] = None,
    openapi_url: Optional[str] = None,
    swagger_js_url: str = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui-bundle.js",
    swagger_css_url: str = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui.css",
    swagger_js_sri: str = "sha384-NXtFPpN61oWCuN4D42K6Zd5Rt2+uxeIT36R7kpXBuY9tLnZorzrJ4ykpqwJfgjpZ",
    swagger_css_sri: str = "sha384-rcbEi6xgdPk0iWkAQzT2F3FeBJXdG+ydrawGlfHAFIZG7wU6aKbQaRewysYpmrlW",
    theme_css_url: str = "/docbuddy-static/themes/light-theme.css",
    debug: bool = False,
) -> None:
    """Mount the LLM-enhanced Swagger UI docs on a FastAPI application.

    This function:
    1. Disables FastAPI's default ``/docs`` route.
    2. Mounts the package's static JS files at ``/docbuddy-static``.
    3. Registers a new ``docs_url`` route that serves the custom Swagger UI page
       with the LLM settings panel injected.

    Args:
        app: The FastAPI application instance.
        docs_url: URL path for the docs page (default ``"/docs"``).
        title: Browser tab title (defaults to ``app.title + " – LLM Docs"``).
        openapi_url: URL of the OpenAPI JSON schema (defaults to ``app.openapi_url``).
        swagger_js_url: CDN URL for the Swagger UI JS bundle.
        swagger_css_url: CDN URL for the Swagger UI CSS.
        swagger_js_sri: SRI hash for the Swagger UI JS bundle.
        swagger_css_sri: SRI hash for the Swagger UI CSS.
        debug: If True, enables debug mode with template auto-reload (default False).
    """
    resolved_title = title or f"{app.title} – LLM Docs"
    resolved_openapi_url = openapi_url or app.openapi_url or "/openapi.json"

    # Use thread lock for route modification to avoid race conditions
    with _route_lock:
        # Check if this app already has LLM docs setup to avoid duplicates
        if app in _llm_apps:
            return

        # Safely remove any existing docs/redoc routes registered by FastAPI

        # Filter routes while avoiding concurrent modification issues
        original_routes = list(app.router.routes)

        # Build set of paths to remove - handle potential None values
        paths_to_remove = {docs_url}
        if app.docs_url:
            paths_to_remove.add(app.docs_url)
        if app.redoc_url:
            paths_to_remove.add(app.redoc_url)

        # Filter routes more safely to avoid issues with different route types
        new_routes = []
        for r in original_routes:
            if isinstance(r, Route):
                # Only remove routes with exact path matches
                if r.path in paths_to_remove:
                    continue
            new_routes.append(r)

        app.router.routes = new_routes
        app.docs_url = None
        app.redoc_url = None

        # Mount static files for the plugin JS inside the lock to prevent TOCTOU race
        already_mounted = any(
            getattr(r, "name", None) == "docbuddy-static" for r in app.router.routes
        )
        if not already_mounted:
            app.mount(
                "/docbuddy-static",
                StaticFiles(directory=str(_STATIC_DIR)),
                name="docbuddy-static",
            )

        # Mark this app as having LLM docs setup
        _llm_apps.add(app)

    # Register the custom docs route
    @app.get(docs_url, include_in_schema=False)
    async def custom_docs() -> HTMLResponse:
        return get_swagger_ui_html(
            openapi_url=resolved_openapi_url,
            title=resolved_title,
            swagger_js_url=swagger_js_url,
            swagger_css_url=swagger_css_url,
            swagger_js_sri=swagger_js_sri,
            swagger_css_sri=swagger_css_sri,
            theme_css_url=theme_css_url,
            debug=debug,
        )

    # Register security middlewares (only once per app)
    if not getattr(app, _SECURITY_HEADERS_ADDED, False):
        setattr(app, _SECURITY_HEADERS_ADDED, True)
        # Add middleware in reverse order of execution
        app.add_middleware(LLMToolCallProxyMiddleware)
        app.add_middleware(SecurityHeadersMiddleware)


# ── Security Middleware for Tool Call Proxy ─────────────────────────────────────


class LLMToolCallProxyMiddleware(BaseHTTPMiddleware):
    """Middleware to proxy tool calls through a secure endpoint with path validation.

    This prevents client-side path traversal attacks by routing all tool call
    API requests through this server-side proxy that validates paths.
    """

    async def dispatch(self, request: Request, call_next):
        # Handle tool call proxy endpoint
        if request.url.path == "/docbuddy-proxy/tool-call":
            return await self._handle_tool_call_proxy(request)

        return await call_next(request)

    async def _handle_tool_call_proxy(self, request: Request) -> JSONResponse:
        """Proxy tool calls with server-side path validation."""
        try:
            body = await request.json()
        except Exception:
            return JSONResponse(status_code=400, content={"error": "Invalid JSON body"})

        # Extract required fields
        method = body.get("method", "GET").upper()
        url = body.get("path", "")
        query_params = body.get("query_params", {})
        path_params = body.get("path_params", {})
        request_body = body.get("body")
        headers = body.get("headers", {})

        # Validate method
        allowed_methods = {"GET", "POST", "PUT", "PATCH", "DELETE"}
        if method not in allowed_methods:
            return JSONResponse(
                status_code=400, content={"error": f"Invalid HTTP method: {method}"}
            )

        # Validate path - MUST start with / and be a relative path
        if not url or not isinstance(url, str):
            return JSONResponse(status_code=400, content={"error": "Path is required"})

        # Path must start with /
        if not url.startswith("/"):
            return JSONResponse(
                status_code=400,
                content={"error": "Path must be relative and start with /"},
            )

        # Check for path traversal
        if ".." in url:
            return JSONResponse(
                status_code=400, content={"error": "Path traversal detected"}
            )

        # Normalize the path (remove duplicate slashes)
        url = re.sub(r"/+", "/", url)

        # Only allow same-origin requests to prevent SSRF
        # The URL should be relative, so we prepend the origin
        full_url = f"{request.url.scheme}://{request.url.hostname}{url}"

        # Additional validation: ensure no scheme in the path
        if "://" in url or url.startswith("//"):
            return JSONResponse(
                status_code=400, content={"error": "Absolute URLs not allowed"}
            )

        # Build query string
        import urllib.parse

        if query_params:
            qs = urllib.parse.urlencode(query_params, doseq=True)
            full_url += f"?{qs}"

        # Validate and apply path parameters
        if path_params:
            try:
                for key, value in path_params.items():
                    # Sanitize path parameter values
                    sanitized_value = str(value).replace("/", "%2F")
                    full_url = full_url.replace(f"{{{key}}}", sanitized_value)
            except Exception as e:
                return JSONResponse(
                    status_code=400,
                    content={"error": f"Invalid path parameters: {str(e)}"},
                )

        # Prepare headers for the proxied request
        proxy_headers = {"Content-Type": "application/json"}

        # Copy authorization if provided (for target API authentication)
        if "Authorization" in headers:
            proxy_headers["Authorization"] = headers["Authorization"]

        # Add body only for requests that support it
        import httpx

        request_kwargs = {
            "method": method,
            "url": full_url,
            "headers": proxy_headers,
            "follow_redirects": True,
            "timeout": 30.0,
        }

        if request_body and method in {"POST", "PUT", "PATCH"}:
            try:
                # Validate body is JSON-serializable
                import json

                json.dumps(request_body)  # Test serialization
                request_kwargs["json"] = request_body
            except Exception as e:
                return JSONResponse(
                    status_code=400,
                    content={"error": f"Invalid request body: {str(e)}"},
                )

        try:
            async with httpx.AsyncClient() as client:
                response = await client.request(**request_kwargs)

                # Return the response from the target API
                return JSONResponse(
                    status_code=response.status_code,
                    content={
                        "status": response.status_code,
                        "statusText": response.reason_phrase,
                        "body": response.text,
                    },
                )
        except httpx.TimeoutException:
            return JSONResponse(status_code=504, content={"error": "Request timeout"})
        except httpx.RequestError as e:
            return JSONResponse(
                status_code=502, content={"error": f"Failed to connect: {str(e)}"}
            )
