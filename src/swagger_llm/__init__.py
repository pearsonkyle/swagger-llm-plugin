"""swagger-llm: Add an LLM configuration panel to your FastAPI Swagger UI docs."""

from .plugin import setup_llm_docs, get_swagger_ui_html

__all__ = ["setup_llm_docs", "get_swagger_ui_html"]
__version__ = "0.2.0"