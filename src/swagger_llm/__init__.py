"""swagger-llm: Add an LLM configuration panel to your FastAPI Swagger UI docs."""

from importlib.metadata import version

try:
    __version__ = version("swagger-llm")
except Exception:
    __version__ = "unknown"

from .plugin import setup_docs, get_swagger_ui_html

__all__ = ["setup_docs", "get_swagger_ui_html"]