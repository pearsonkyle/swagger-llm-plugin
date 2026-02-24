"""Demo FastAPI server showcasing swagger-llm-ui integration.

Run with:
    uvicorn examples.demo_server:app --reload
Then open http://localhost:8000/docs
"""

from typing import Any, Dict, List, Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import sys
import os

# Allow running from the repo root without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from swagger_llm_ui import LLMConfig, get_llm_config, setup_llm_docs

app = FastAPI(
    title="swagger-llm-ui Demo",
    version="0.2.0",
    description="""
A demonstration of the swagger-llm-ui package with LLM-enhanced API documentation.

Features:
- LLM Settings panel to configure your OpenAI-compatible API
- Provider presets for OpenAI, Anthropic, Ollama, LM Studio, vLLM
- Connection testing with visual feedback
- Interactive chat panel for API documentation questions
- Automatic curl and code generation from API calls
""",
)

# Mount the LLM-enhanced Swagger UI (replaces the default /docs)
setup_llm_docs(app, debug=True)


# ── Models ───────────────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None


class LLMSettingsRequest(BaseModel):
    base_url: str
    api_key: Optional[str] = None
    model_id: str = "gpt-4"
    max_tokens: int = 4096
    temperature: float = 0.7


# ── Utility Functions ────────────────────────────────────────────────────────


def build_llm_url(base_url: str, path: str) -> str:
    """Build a full LLM API URL from base URL and endpoint path."""
    base = base_url.rstrip("/")
    if not path.startswith("/"):
        path = "/" + path
    return base + path


def build_headers(llm: LLMConfig) -> Dict[str, str]:
    """Build standard headers for LLM API requests."""
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if llm.api_key:
        headers["Authorization"] = f"Bearer {llm.api_key}"
    return headers


# ── Endpoints ────────────────────────────────────────────────────────────────


@app.get("/health", tags=["utility"])
async def health():
    """Returns the health status of the service."""
    return {"status": "ok"}


@app.get("/info", tags=["utility"])
async def info():
    """Returns information about the LLM configuration."""
    return {
        "package_version": "0.2.0",
        "features": [
            "LLM provider presets (OpenAI, Anthropic, Ollama, etc.)",
            "Connection testing with visual feedback",
            "Inline chat panel for API questions",
            "Curl and code generation from API calls",
            "Debounced settings save with auto-save",
        ],
    }


@app.get("/models", tags=["models"])
async def list_models(llm: LLMConfig = Depends(get_llm_config)):
    """Proxy the /models endpoint of the configured LLM API.

    This endpoint retrieves available models from your configured LLM provider.
    The request headers are automatically injected by the Swagger UI LLM panel.
    """
    url = build_llm_url(llm.base_url, "/models")
    headers = build_headers(llm)

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            response = await client.get(url, headers=headers)
            return JSONResponse(content=response.json(), status_code=response.status_code)
        except httpx.RequestError as exc:
            return JSONResponse(
                content={"error": f"Request failed: {exc}", "url": url},
                status_code=502,
            )


@app.post("/chat/completions", tags=["chat"])
async def chat_completions(
    body: ChatRequest,
    llm: LLMConfig = Depends(get_llm_config),
):
    """Proxy a chat completion request to the configured LLM API.

    LLM settings (base URL, API key, model, etc.) are injected automatically
    from the X-LLM-* headers set by the Swagger UI LLM settings panel.

    Example request body:
    ```json
    {
      "messages": [
        {"role": "user", "content": "Hello!"}
      ],
      "model": "gpt-4",
      "max_tokens": 100
    }
    ```
    """
    url = build_llm_url(llm.base_url, "/chat/completions")
    headers = build_headers(llm)

    payload: Dict[str, Any] = {
        "model": body.model or llm.model_id,
        "messages": [m.dict() for m in body.messages],
        "max_tokens": body.max_tokens or llm.max_tokens,
        "temperature": body.temperature if body.temperature is not None else llm.temperature,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            response = await client.post(url, headers=headers, json=payload)
            return JSONResponse(content=response.json(), status_code=response.status_code)
        except httpx.RequestError as exc:
            return JSONResponse(
                content={"error": f"Request failed: {exc}", "url": url},
                status_code=502,
            )


@app.post("/chat/completions/stream", tags=["chat"])
async def chat_completions_stream(
    body: ChatRequest,
    llm: LLMConfig = Depends(get_llm_config),
):
    """Proxy a streaming chat completion request to the configured LLM API.

    This endpoint streams responses as Server-Sent Events (SSE).
    """
    url = build_llm_url(llm.base_url, "/chat/completions")
    headers = build_headers(llm)

    # For streaming, we need to set up the payload without max_tokens if not specified
    payload: Dict[str, Any] = {
        "model": body.model or llm.model_id,
        "messages": [m.dict() for m in body.messages],
        "temperature": body.temperature if body.temperature is not None else llm.temperature,
    }

    # Add max_tokens only if specified
    if body.max_tokens:
        payload["max_tokens"] = body.max_tokens

    # Add stream parameter
    if not payload.get("stream"):
        payload["stream"] = True

    async def stream_response():
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        yield f"data: {{'error': 'HTTP {response.status_code}', 'details': '{error_text.decode()}'}}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data: "):
                            data = line[6:]
                            if data == "[DONE]":
                                yield "data: [DONE]\n\n"
                            else:
                                try:
                                    import json
                                    chunk = json.loads(data)
                                    yield f"data: {json.dumps(chunk)}\n\n"
                                except json.JSONDecodeError:
                                    yield f"data: {data}\n\n"
        except httpx.RequestError as exc:
            yield f"data: {{'error': 'Request failed', 'details': '{str(exc)}'}}\n\n"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(stream_response(), media_type="text/event-stream")


@app.post("/embeddings", tags=["embeddings"])
async def create_embeddings(
    body: Dict[str, Any],
    llm: LLMConfig = Depends(get_llm_config),
):
    """Proxy an embeddings request to the configured LLM API."""
    url = build_llm_url(llm.base_url, "/embeddings")
    headers = build_headers(llm)

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.post(url, headers=headers, json=body)
            return JSONResponse(content=response.json(), status_code=response.status_code)
        except httpx.RequestError as exc:
            return JSONResponse(
                content={"error": f"Request failed: {exc}", "url": url},
                status_code=502,
            )


@app.get("/docs/settings", tags=["settings"])
async def get_docs_settings():
    """Get the current Swagger UI LLM settings (for debugging)."""
    return {
        "description": "These settings are stored in browser localStorage and injected as headers",
        "settings_stored_in": "localStorage (swagger-llm-settings key)",
        "headers_injected": [
            "X-LLM-Base-Url",
            "X-LLM-Api-Key", 
            "X-LLM-Model-Id",
            "X-LLM-Max-Tokens",
            "X-LLM-Temperature",
        ],
    }


# ── Error handlers ───────────────────────────────────────────────────────────


@app.exception_handler(502)
async def proxy_error_handler(request, exc):
    """Custom handler for proxy errors."""
    return JSONResponse(
        status_code=502,
        content={
            "error": "Proxy error",
            "message": str(exc),
            "hint": "Check your LLM provider settings in the Swagger UI panel",
        },
    )


# ── Main entry point for development ────────────────────────────────────────


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
