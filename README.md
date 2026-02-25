# Swagger LLM Plugin

> Add an AI assistant to your FastAPI `/docs` page.

![](examples/example.gif)

This package enhances the Swagger UI with an LLM-powered chat assistant and settings panel. Users configure their API credentials directly in the browser to power a client-side AI Assistant that can answer questions about your API and execute requests using tool calling.

## Features

- 💬 AI chat assistant with full OpenAPI context
- 🤖 LLM Settings panel with local providers (Ollama, LM Studio, vLLM, Custom)
- 🔗 Tool-calling for API Requests
- 🎨 Dark/light theme support

## Installation

```bash
pip install swagger-llm
```

## Quick Start

```python
from fastapi import FastAPI
from swagger_llm import setup_llm_docs

app = FastAPI()
setup_llm_docs(app)  # Replaces /docs with LLM version
```

That's it! Visit `/docs` and:
1. Configure your LLM in the top panel
2. Use the **Chat** tab to ask questions about your API

## Using the Chat Assistant

- Open the **Chat** tab
- Ask questions like:
  - "What endpoints are available?"
  - "Show me how to use /users"
  - "Generate a curl command for /health"

The assistant uses your OpenAPI schema to provide accurate answers.

## Development

```bash
pip install -e ".[dev]"
pytest tests/
```

## Demo Server

```bash
uvicorn examples.demo_server:app --reload
```

## To Do
- add the curl request to a copiable code block in UI message after tool call
- Disable the clear chat button and send button while the request is streaming back
- default system prompt on start up is missing the tooling template for openapi docs

- expose system prompt settings into file so it can be edited more easily and support presets in the future