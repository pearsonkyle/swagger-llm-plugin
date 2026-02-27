"""Demo FastAPI server showcasing swagger-llm-ui integration.

Run with:
    uvicorn examples.demo_server:app --reload
Then open http://localhost:8000/docs
"""

from typing import Any, Dict, List

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from datetime import date

import sys
import os

# Allow running from the repo root without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from swagger_llm import setup_llm_docs

app = FastAPI(
    title="Invoice API",
    version="0.3.0",
    description="""
A demonstration of LLM-enhanced API documentation using the [swagger-llm-plugin](https://github.com/pearsonkyle/swagger-llm-plugin).

## Features

- 💬 AI chat assistant with full OpenAPI context
- 🤖 LLM Settings with local providers (Ollama, LM Studio, vLLM, Custom)
- 🔗 Tool-calling for API Requests
- 🎨 Dark/light theme support

## Installation

```bash
pip install swagger-llm
```

## Quick Start

```python
from fastapi import FastAPI
from swagger_llm import setup_docs

app = FastAPI()
setup_docs(app)  # replaces default /docs
```

### Example

Use the **Chat** panel to ask questions about these endpoints!
""",
)

# Mount the LLM-enhanced Swagger UI (replaces the default /docs)
setup_llm_docs(app, debug=True)

# ── Pydantic Models for Invoicing ────────────────────────────────────────────

class LineItem(BaseModel):
    """A single line item in an invoice."""
    description: str = Field(..., description="Description of the item")
    quantity: int = Field(default=1, ge=1, description="Quantity of items")
    unit_price: float = Field(..., gt=0, description="Price per unit")


class CreateInvoice(BaseModel):
    """Input model for creating a new invoice."""
    customer_name: str = Field(..., min_length=1, description="Customer's name")
    customer_email: str = Field(..., description="Customer's email address")
    items: List[LineItem] = Field(..., min_length=1, description="List of line items")
    due_date: date = Field(default_factory=date.today, description="Invoice due date")


class Invoice(BaseModel):
    """Complete invoice model."""
    id: int
    created_at: date
    customer_name: str
    customer_email: str
    items: List[LineItem]
    due_date: date
    total_amount: float


# ── In-Memory Storage ───────────────────────────────────────────────────────

invoices: List[Invoice] = []
invoice_counter = 0

# ── Endpoints ───────────────────────────────────────────────────────────────


@app.get("/health", tags=["utility"])
async def health():
    """Health check endpoint.
    
    Returns the health status of the service. This endpoint is used for
    basic uptime monitoring.
    """
    return {"status": "ok"}


@app.get("/invoices", response_model=List[Invoice], tags=["invoices"])
async def list_invoices():
    """List all invoices.
    
    Returns a list of all created invoices with their details and totals.
    """
    return invoices


@app.post("/invoices", response_model=Invoice, status_code=201, tags=["invoices"])
async def create_invoice(invoice_data: CreateInvoice):
    """Create a new invoice.
    
    Creates an invoice from the provided data and assigns it a unique ID.
    """
    global invoice_counter
    
    # Calculate total amount
    total = sum(item.quantity * item.unit_price for item in invoice_data.items)
    
    invoice_counter += 1
    
    new_invoice = Invoice(
        id=invoice_counter,
        created_at=date.today(),
        total_amount=total,
        **invoice_data.model_dump()
    )
    
    # Add the calculated total
    invoices.append(new_invoice)
    
    return new_invoice


@app.get("/invoices/{invoice_id}", response_model=Invoice, tags=["invoices"])
async def get_invoice(invoice_id: int):
    """Get a specific invoice by ID.
    
    Retrieves the details of an invoice including all line items and totals.
    """
    for invoice in invoices:
        if invoice.id == invoice_id:
            return invoice
    
    return JSONResponse(
        status_code=404,
        content={"error": "Invoice not found"}
    )


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