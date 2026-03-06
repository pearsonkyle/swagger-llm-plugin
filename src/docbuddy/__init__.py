"""docbuddy: Add an LLM configuration panel to your FastAPI Swagger UI docs."""

from importlib.metadata import version, PackageNotFoundError

try:
    __version__ = version("docbuddy")
except PackageNotFoundError:
    __version__ = "unknown"

from .plugin import setup_docs, get_swagger_ui_html

__all__ = ["setup_docs", "get_swagger_ui_html"]
