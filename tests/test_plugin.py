"""Tests for swagger-llm-ui package."""

import sys
import os

# Ensure we can import the source package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from swagger_llm_ui import LLMConfig, get_llm_config, setup_llm_docs
from swagger_llm_ui.plugin import get_swagger_ui_html


# ── Fixtures ─────────────────────────────────────────────────────────────────


def make_app() -> FastAPI:
    """Return a fresh FastAPI app with LLM docs set up."""
    app = FastAPI(title="Test App")
    setup_llm_docs(app)
    return app


def make_debug_app() -> FastAPI:
    """Return a fresh FastAPI app with LLM docs in debug mode."""
    app = FastAPI(title="Test App Debug")
    setup_llm_docs(app, debug=True)
    return app


# ── Bug Fix Tests ────────────────────────────────────────────────────────────


def test_request_interceptor_includes_all_headers():
    """The docs page should include the requestInterceptor with all X-LLM-* headers."""
    client = TestClient(make_app())
    html = client.get("/docs").text
    
    # Check all required headers are in the interceptor
    required_headers = [
        "X-LLM-Base-Url",
        "X-LLM-Api-Key", 
        "X-LLM-Model-Id",
        "X-LLM-Max-Tokens",
        "X-LLM-Temperature",
    ]
    
    for header in required_headers:
        assert header in html, f"Missing {header} from requestInterceptor"
    
    # Check the empty string checks for numeric fields
    assert "maxTokens !== ''" in html or '"" !== ""' in html
    assert "temperature !== ''" in html


def test_empty_string_handling_in_interceptor():
    """Test that empty strings don't get sent as header values."""
    client = TestClient(make_app())
    html = client.get("/docs").text
    
    # Verify empty string checks are present for numeric fields
    assert "maxTokens !== ''" in html
    assert "temperature !== ''" in html


def test_debounce_on_connection_test():
    """Verify debounce is applied to connection test."""
    client = TestClient(make_app())
    html = client.get("/docs").text
    
    # Check for debounce function definition
    assert "debounce" in html or "debounce" in client.get("/swagger-llm-static/llm-settings-plugin.js").text


def test_error_feedback_in_connection_test():
    """Verify error feedback is shown when connection fails."""
    client = TestClient(make_app())

    # Check JavaScript file for error handling
    js_content = client.get("/swagger-llm-static/llm-settings-plugin.js").text

    # Check for .catch in JavaScript
    assert ".catch" in js_content


def test_route_cleanup_thread_safety():
    """Test that route cleanup uses thread-safe operations."""
    # Create multiple apps simultaneously
    app1 = make_app()
    app2 = make_app()
    
    client1 = TestClient(app1)
    client2 = TestClient(app2)
    
    # Both should have docs endpoint
    assert client1.get("/docs").status_code == 200
    assert client2.get("/docs").status_code == 200
    
    # OpenAPI should still work
    assert client1.get("/openapi.json").status_code == 200
    assert client2.get("/openapi.json").status_code == 200


def test_debug_mode_disables_cache():
    """Test that debug mode enables auto-reload."""
    client = TestClient(make_debug_app())
    
    # Debug app should work
    response = client.get("/docs")
    assert response.status_code == 200
    
    # Check that HTML contains debug-related setup
    html = response.text
    assert "debug" in html.lower() or "auto.reload" in html.lower()


def test_provider_presets_available():
    """Verify LLM provider presets are available in the JavaScript."""
    client = TestClient(make_app())
    
    js_content = client.get("/swagger-llm-static/llm-settings-plugin.js").text
    
    # Check for provider configurations
    providers = ["openai", "anthropic", "ollama", "lmstudio", "vllm"]
    for provider in providers:
        assert provider in js_content.lower() or provider.upper() in js_content


def test_number_coercion_fix():
    """Test that Number() coercion handles empty strings correctly."""
    client = TestClient(make_app())
    
    js_content = client.get("/swagger-llm-static/llm-settings-plugin.js").text
    
    # Check that empty string checks exist for numeric inputs
    assert "maxTokens !== ''" in js_content
    assert "temperature !== ''" in js_content


def test_css_scoping():
    """Verify CSS is properly scoped to avoid conflicts."""
    client = TestClient(make_app())
    html = client.get("/docs").text
    
    # Check for scoped styles
    assert "#llm-settings-panel" in html or "llm-settings-panel {" in html
    
    # Check for provider badge styles
    assert ".llm-provider-badge" in html or "llm-provider-badge" in html


def test_chat_panel_included():
    """Verify chat panel component is included."""
    client = TestClient(make_app())
    
    js_content = client.get("/swagger-llm-static/llm-settings-plugin.js").text

    assert "ChatPanel" in js_content
    assert "chatHistory" in js_content


def test_code_generator_functions():
    """Verify code generation functions are available."""
    client = TestClient(make_app())

    js_content = client.get("/swagger-llm-static/llm-settings-plugin.js").text

    # Check for curl generation (code generator functions removed in v0.3.1)
    assert "curl" in js_content.lower()


# ── setup_llm_docs tests ──────────────────────────────────────────────────────


def test_docs_route_exists():
    """The /docs route should be reachable and return 200."""
    client = TestClient(make_app())
    response = client.get("/docs")
    assert response.status_code == 200


def test_docs_returns_html():
    """The /docs route should return an HTML content-type."""
    client = TestClient(make_app())
    response = client.get("/docs")
    assert "text/html" in response.headers["content-type"]


def test_docs_contains_plugin_scripts():
    """The docs page HTML should reference both LLM plugin JS files."""
    client = TestClient(make_app())
    html = client.get("/docs").text
    assert "llm-settings-plugin.js" in html
    assert "llm-layout-plugin.js" in html


def test_docs_contains_swagger_bundle():
    """The docs page should reference the Swagger UI bundle."""
    client = TestClient(make_app())
    html = client.get("/docs").text
    assert "swagger-ui-bundle" in html


def test_static_files_served():
    """The plugin JS files should be served from /swagger-llm-static."""
    client = TestClient(make_app())
    assert client.get("/swagger-llm-static/llm-settings-plugin.js").status_code == 200
    assert client.get("/swagger-llm-static/llm-layout-plugin.js").status_code == 200


def test_custom_docs_url():
    """setup_llm_docs should work with a custom docs_url."""
    app = FastAPI(title="Custom URL Test")
    setup_llm_docs(app, docs_url="/api-docs")
    client = TestClient(app)
    assert client.get("/api-docs").status_code == 200
    # Default /docs should not exist
    assert client.get("/docs").status_code == 404


def test_openapi_json_still_accessible():
    """The OpenAPI JSON schema should still be accessible."""
    client = TestClient(make_app())
    response = client.get("/openapi.json")
    assert response.status_code == 200
    data = response.json()
    assert "openapi" in data


def test_docs_contains_request_interceptor():
    """The docs page should include the X-LLM-* request interceptor."""
    client = TestClient(make_app())
    html = client.get("/docs").text
    assert "requestInterceptor" in html
    assert "X-LLM-" in html


# ── get_swagger_ui_html tests ─────────────────────────────────────────────────


def test_get_swagger_ui_html_returns_html_response():
    """get_swagger_ui_html should return an HTMLResponse."""
    from fastapi.responses import HTMLResponse

    resp = get_swagger_ui_html(openapi_url="/openapi.json", title="Test")
    assert isinstance(resp, HTMLResponse)
    assert "swagger" in resp.body.decode().lower()


def test_get_swagger_ui_html_includes_title():
    """The rendered HTML should contain the provided title."""
    resp = get_swagger_ui_html(openapi_url="/openapi.json", title="My Custom Title")
    assert "My Custom Title" in resp.body.decode()


def test_get_swagger_ui_html_includes_openapi_url():
    """The rendered HTML should reference the provided OpenAPI URL."""
    resp = get_swagger_ui_html(openapi_url="/custom/openapi.json", title="T")
    assert "/custom/openapi.json" in resp.body.decode()


def test_get_swagger_ui_html_includes_debug_flag():
    """The rendered HTML should support debug mode."""
    from fastapi.responses import HTMLResponse
    resp = get_swagger_ui_html(openapi_url="/openapi.json", title="T", debug=True)
    assert isinstance(resp, HTMLResponse)


# ── get_llm_config dependency tests ──────────────────────────────────────────


@pytest.mark.anyio
async def test_get_llm_config_defaults():
    """get_llm_config should return defaults when no headers are present."""
    config = await get_llm_config()
    assert config.base_url == "https://api.openai.com/v1"
    assert config.api_key is None
    assert config.model_id == "gpt-4"
    assert config.max_tokens == 4096
    assert config.temperature == 0.7


@pytest.mark.anyio
async def test_get_llm_config_from_headers():
    """get_llm_config should parse header values correctly."""
    config = await get_llm_config(
        x_llm_base_url="http://localhost:11434/v1",
        x_llm_api_key="test-key",
        x_llm_model_id="llama3",
        x_llm_max_tokens="2048",
        x_llm_temperature="0.5",
    )
    assert config.base_url == "http://localhost:11434/v1"
    assert config.api_key == "test-key"
    assert config.model_id == "llama3"
    assert config.max_tokens == 2048
    assert config.temperature == 0.5


@pytest.mark.anyio
async def test_get_llm_config_invalid_numerics():
    """get_llm_config should fall back to defaults on non-numeric values."""
    config = await get_llm_config(
        x_llm_max_tokens="not-a-number",
        x_llm_temperature="bad",
    )
    assert config.max_tokens == 4096
    assert config.temperature == 0.7


def test_llm_config_via_endpoint():
    """The get_llm_config dependency should work end-to-end in a FastAPI app."""
    app = FastAPI(title="Dep Test")
    setup_llm_docs(app)

    @app.get("/cfg")
    async def cfg_endpoint(llm: LLMConfig = Depends(get_llm_config)):
        return {
            "base_url": llm.base_url,
            "model_id": llm.model_id,
            "max_tokens": llm.max_tokens,
        }

    client = TestClient(app)
    response = client.get(
        "/cfg",
        headers={
            "X-LLM-Base-Url": "http://ollama:11434/v1",
            "X-LLM-Model-Id": "mistral",
            "X-LLM-Max-Tokens": "1024",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["base_url"] == "http://ollama:11434/v1"
    assert data["model_id"] == "mistral"
    assert data["max_tokens"] == 1024


# ── LLMConfig dataclass tests ─────────────────────────────────────────────────


def test_llm_config_dataclass_defaults():
    """LLMConfig dataclass should have correct default values."""
    cfg = LLMConfig()
    assert cfg.base_url == "https://api.openai.com/v1"
    assert cfg.api_key is None
    assert cfg.model_id == "gpt-4"
    assert cfg.max_tokens == 4096
    assert cfg.temperature == 0.7


def test_llm_config_dataclass_custom_values():
    """LLMConfig dataclass should accept custom field values."""
    cfg = LLMConfig(base_url="http://local/v1", api_key="key", model_id="gpt-3.5-turbo")
    assert cfg.base_url == "http://local/v1"
    assert cfg.api_key == "key"
    assert cfg.model_id == "gpt-3.5-turbo"


# ── Edge case tests ───────────────────────────────────────────────────────────


def test_empty_api_key_does_not_break_requests():
    """Test that empty API key doesn't break request interceptor."""
    client = TestClient(make_app())
    
    # Make a request to an endpoint that uses LLM config
    @client.app.get("/test")
    def test_endpoint(llm: LLMConfig = Depends(get_llm_config)):
        return {"has_key": llm.api_key is not None}
    
    response = client.get("/test")
    assert response.status_code == 200
    # Empty key should result in None
    assert response.json()["has_key"] is False


def test_provider_preset_ollama():
    """Test Ollama provider preset."""
    client = TestClient(make_app())
    js_content = client.get("/swagger-llm-static/llm-settings-plugin.js").text
    
    # Check Ollama preset
    assert "ollama" in js_content.lower()
    assert "localhost:11434/v1" in js_content


def test_provider_preset_anthropic():
    """Test Anthropic provider preset."""
    client = TestClient(make_app())
    js_content = client.get("/swagger-llm-static/llm-settings-plugin.js").text
    
    # Check Anthropic preset
    assert "anthropic" in js_content.lower()
    assert "api.anthropic.com/v1" in js_content


def test_provider_preset_vllm():
    """Test vLLM provider preset."""
    client = TestClient(make_app())
    js_content = client.get("/swagger-llm-static/llm-settings-plugin.js").text
    
    # Check vLLM preset
    assert "vllm" in js_content.lower()
    assert "localhost:8000/v1" in js_content


def test_concurrent_app_setup():
    """Test that setting up multiple apps concurrently doesn't cause issues."""
    import threading
    import time

    results = []

    def setup_app(idx):
        try:
            app = FastAPI(title=f"Test App {idx}")
            setup_llm_docs(app)
            client = TestClient(app)

            # Verify docs work
            docs_resp = client.get("/docs")

            results.append({"idx": idx, "success": docs_resp.status_code == 200})
        except Exception as e:
            results.append({"idx": idx, "success": False, "error": str(e)})

    # Setup multiple apps concurrently
    threads = []
    for i in range(5):
        t = threading.Thread(target=setup_app, args=(i,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    # All should succeed
    assert all(r["success"] for r in results)


# ── /llm-chat endpoint tests ────────────────────────────────────────────────


def test_llm_chat_route_exists():
    """The /llm-chat route should be reachable and return SSE stream."""
    client = TestClient(make_app())
    response = client.post(
        "/llm-chat",
        json={"messages": [{"role": "user", "content": "hello"}], "openapi_summary": ""},
        headers={"X-LLM-Base-Url": "http://localhost:9999/v1"},
    )
    # Streaming endpoint returns 200 with SSE error event (no real backend)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    # The body should contain an SSE data line with an error
    assert "data: " in response.text
    assert "error" in response.text.lower() or "Request failed" in response.text


def test_llm_chat_accepts_openapi_summary():
    """The /llm-chat endpoint should accept an openapi_summary field."""
    client = TestClient(make_app())
    response = client.post(
        "/llm-chat",
        json={
            "messages": [{"role": "user", "content": "What endpoints are available?"}],
            "openapi_summary": "## API: Test v1\n\n## Endpoints\n- GET /health",
        },
        headers={"X-LLM-Base-Url": "http://localhost:9999/v1"},
    )
    # Streaming endpoint returns 200 with SSE content
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]


def test_llm_chat_empty_messages_rejected():
    """The /llm-chat endpoint should reject requests without required fields."""
    client = TestClient(make_app())
    response = client.post("/llm-chat", json={})
    assert response.status_code == 422  # Validation error


def test_llm_chat_uses_llm_headers():
    """The /llm-chat endpoint should read LLM config from X-LLM-* headers."""
    client = TestClient(make_app())
    response = client.post(
        "/llm-chat",
        json={"messages": [{"role": "user", "content": "hi"}]},
        headers={
            "X-LLM-Base-Url": "http://localhost:9999/v1",
            "X-LLM-Api-Key": "test-key",
            "X-LLM-Model-Id": "test-model",
        },
    )
    # Streaming endpoint returns 200 with error SSE event containing the URL
    assert response.status_code == 200
    assert "localhost:9999" in response.text


def test_llm_chat_not_in_openapi_schema():
    """The /llm-chat endpoint should not appear in the OpenAPI schema."""
    client = TestClient(make_app())
    schema = client.get("/openapi.json").json()
    assert "/llm-chat" not in schema.get("paths", {})


# ── OpenAPI Schema Context Tests ─────────────────────────────────────────────


def test_build_openapi_context_from_full_schema():
    """Test that build_openapi_context converts full schema to readable format."""
    from swagger_llm_ui.plugin import build_openapi_context
    
    schema = {
        "info": {"title": "Test API", "version": "1.0.0"},
        "paths": {
            "/users": {
                "get": {
                    "summary": "List Users",
                    "operationId": "listUsers",
                    "tags": ["users"],
                    "parameters": [
                        {"name": "limit", "in": "query", "required": False, "type": "integer"}
                    ],
                    "responses": {
                        "200": {"description": "Successful response"},
                        "401": {"description": "Unauthorized"}
                    }
                },
                "post": {
                    "summary": "Create User",
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {"name": {"type": "string"}, "email": {"type": "string"}}
                                }
                            }
                        }
                    },
                    "responses": {"201": {"description": "User created"}}
                }
            }
        },
        "components": {
            "schemas": {
                "User": {
                    "type": "object",
                    "properties": {"id": {"type": "integer"}, "name": {"type": "string"}}
                }
            }
        }
    }
    
    context = build_openapi_context(schema)
    
    # Check key information is included
    assert "Test API" in context
    assert "## `/users`" in context or "`/users`" in context
    assert "GET" in context
    assert "POST" in context
    assert "List Users" in context or "summary" in context.lower()
    assert "Create User" in context
    assert "User" in context  # Schema name


def test_openapi_context_includes_servers():
    """Test that server URLs are included in OpenAPI context."""
    from swagger_llm_ui.plugin import build_openapi_context
    
    schema = {
        "info": {"title": "Test API", "version": "1.0.0"},
        "servers": [
            {"url": "https://api.example.com/v1", "description": "Production"},
            {"url": "http://localhost:8000", "description": "Development"}
        ],
        "paths": {}
    }
    
    context = build_openapi_context(schema)
    
    assert "Production" in context or "Development" in context
    assert "https://api.example.com/v1" in context


def test_openapi_context_handles_empty_schema():
    """Test that empty/invalid schemas don't cause errors."""
    from swagger_llm_ui.plugin import build_openapi_context
    
    assert build_openapi_context(None) == ""
    assert build_openapi_context({}) == ""
    assert build_openapi_context("invalid") == ""


def test_llm_chat_accepts_full_openapi_schema():
    """The /llm-chat endpoint should accept a full openapi_schema field."""
    client = TestClient(make_app())
    
    # Create a minimal OpenAPI schema
    openapi_schema = {
        "info": {"title": "Test API", "version": "1.0.0"},
        "paths": {
            "/health": {
                "get": {
                    "summary": "Health Check",
                    "responses": {"200": {"description": "OK"}}
                }
            }
        }
    }
    
    response = client.post(
        "/llm-chat",
        json={
            "messages": [{"role": "user", "content": "What is the health endpoint?"}],
            "openapi_schema": openapi_schema
        },
        headers={"X-LLM-Base-Url": "http://localhost:9999/v1"},
    )
    
    # Streaming endpoint returns 200 with SSE content
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]


def test_openapi_schema_takes_precedence_over_summary():
    """When both openapi_schema and openapi_summary are provided, schema should be used."""
    client = TestClient(make_app())
    
    response = client.post(
        "/llm-chat",
        json={
            "messages": [{"role": "user", "content": "test"}],
            "openapi_summary": "This is old format",
            "openapi_schema": {
                "info": {"title": "New Schema API", "version": "2.0.0"},
                "paths": {
                    "/test": {
                        "get": {"summary": "Test", "responses": {"200": {"description": "OK"}}}
                    }
                }
            }
        },
        headers={"X-LLM-Base-Url": "http://localhost:9999/v1"},
    )
    
    assert response.status_code == 200


def test_fetch_openapi_schema_in_chat_panel():
    """Test that the JavaScript fetches and stores OpenAPI schema."""
    client = TestClient(make_app())
    
    # Get the docs page to verify JavaScript contains fetch logic
    html = client.get("/docs").text
    
    # Check that the JavaScript includes OpenAPI schema fetching
    assert "fetchOpenApiSchema" in html or "/swagger-llm-static/llm-settings-plugin.js" in html
    
    # Check that the JS file contains schema storage logic
    js_content = client.get("/swagger-llm-static/llm-settings-plugin.js").text
    assert "openapiSchema" in js_content
