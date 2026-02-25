"""Demo FastAPI server showcasing swagger-llm-ui integration.

Run with:
    uvicorn examples.demo_server:app --reload
Then open http://localhost:8000/docs
"""

from typing import Any, Dict, List

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import sys
import os

# Allow running from the repo root without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from swagger_llm import setup_llm_docs

app = FastAPI(
    title="Demo Server",
    version="0.3.0",
    description="""
A demonstration of the swagger-llm-plugin package with LLM-enhanced API documentation.

## Features
- Provider presets for Ollama, LM Studio, vLLM
- Interactive chat panel with SSE streaming

## Client-Side LLM Architecture
Since locally-hosted LLMs support CORS, the browser talks directly to them:
- No server proxy endpoint required
- No X-LLM-* header forwarding needed  
- OpenAPI schema formatted client-side and sent to {baseUrl}/chat/completions

Configure your LLM provider settings in the "Settings" tab. The browser will
use those directly to call the LLM's API endpoint.
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
    model: str = "gpt-4"
    max_tokens: int = 100
    temperature: float = 0.7


# ── Endpoints (simple examples) ──────────────────────────────────────────────


@app.get("/health", tags=["utility"])
async def health():
    """Health check endpoint.
    
    Returns the health status of the service. This endpoint is used for
    basic uptime monitoring.
    """
    return {"status": "ok"}


@app.get("/info", tags=["utility"])
async def info():
    """Info endpoint.
    
    Returns information about this demo server, including package version
    and available features.
    """
    return {
        "package_version": "0.3.0",
        "features": [
            "LLM provider presets (Ollama, LM Studio, vLLM)",
            "Client-side LLM calls (no server proxy)",
            "Connection testing with visual feedback",
            "Inline chat panel for API questions",
        ],
    }


@app.post("/greet", tags=["demo"])
async def greet(name: str = "World"):
    """Simple greeting endpoint.
    
    Demonstrates a basic API endpoint that doesn't require LLM configuration.
    """
    return {"message": f"Hello, {name}!"}


@app.get("/items", tags=["demo"])
async def list_items(limit: int = 10):
    """List items endpoint.
    
    Demonstrates a basic API with query parameters.
    """
    return {
        "items": [
            {"id": i, "name": f"Item {i}", "price": round(10.99 * (1 + i * 0.1), 2)}
            for i in range(1, min(limit + 1, 21))
        ]
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