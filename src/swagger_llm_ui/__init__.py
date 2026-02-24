"""swagger-llm-ui: Add an LLM configuration panel to your FastAPI Swagger UI docs."""

from .plugin import setup_llm_docs, get_swagger_ui_html
from .dependencies import LLMConfig, get_llm_config

__all__ = ["setup_llm_docs", "get_swagger_ui_html", "LLMConfig", "get_llm_config"]
__version__ = "0.2.0"
