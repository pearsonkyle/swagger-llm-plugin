# DocBuddy - AI Assistant Context

This document provides comprehensive context for AI assistants working on the DocBuddy repository.

## Project Overview

**DocBuddy** is a Python package that enhances FastAPI's Swagger UI documentation with an AI assistant. It enables developers to interact with their API documentation using natural language, execute API calls via tool calling, and build complex workflows with LLMs.

1. **API Explorer** — Enhanced OpenAPI documentation viewer
2. **Chat Interface** — AI assistant for asking questions about API documentation with full OpenAPI context
3. **Workflow Panel** — Multi-step AI workflows with tool calling support
4. **Agent Panel** — Autonomous task execution with Plan/Act modes and iterative tool calling
5. **LLM Settings** — Configurable settings for local LLM providers (Ollama, LM Studio, vLLM)
6. **Direct Browser-to-LLM Communication** — No server proxy required for local LLMs

Since locally-hosted LLMs support CORS, the browser talks to them directly, eliminating:
- The server proxy endpoint
- All `X-LLM-*` header machinery
- The `httpx` dependency

Users configure LLM credentials in-browser; those are persisted in localStorage and used directly by the browser to call the LLM's `/chat/completions` endpoint.

## Installation

### Installation
```bash
pip install docbuddy
```

### Quick Start
```python
from fastapi import FastAPI
from docbuddy import setup_docs

app = FastAPI()
setup_docs(app)  # replaces default /docs
```

---

## Architecture

### Backend (`src/docbuddy/`)

#### Main Files
| File | Purpose |
|------|---------|
| `plugin.py` | Core plugin logic - mounts custom Swagger UI with LLM panels |
| `__init__.py` | Package exports (`setup_docs`, `get_swagger_ui_html`) |

#### Key Functions
- **`setup_docs(app, ...)`** - Mounts the LLM-enhanced docs on a FastAPI app
  - Disables default `/docs` and `/redoc` routes
  - Mounts static files at `/docbuddy-static/`
  - Registers custom docs route

- **`get_swagger_ui_html(...)`** - Returns HTMLResponse with custom Swagger UI
  - Lower-level helper; most users should use `setup_docs`

#### Thread Safety
- Uses `_route_lock` (threading.Lock) for route modifications
- `_llm_apps` tracks which apps have LLM docs setup to avoid duplicates

### Frontend (`src/docbuddy/static/`)

```
core.js → chat.js, settings.js, workflow.js, agent.js → plugin.js
```

#### `core.js` — Shared Utilities & State

Establishes the `window.DocBuddy` namespace with all shared code:

- **Storage helpers**: `loadFromStorage()`, `saveToStorage()`, `loadChatHistory()`, `saveChatHistory()`, `loadToolSettings()`, `saveToolSettings()`, `loadTheme()`, `saveTheme()`, `exportAsJson()`
- **OpenAPI helpers**: `buildOpenApiContext(schema)`, `buildApiRequestTool(schema)`, `ensureOpenapiSchemaCached()`
- **System prompts**: `loadSystemPromptConfig()`, `ensureSystemPromptConfig()`, `getSystemPromptForPreset(presetName, schema, customPromptText)`, `buildDefaultSystemPrompt(schema)`
- **State management**: Redux-like actions, reducer (`llmSettingsReducer`), selectors, `dispatchAction()`
- **Utilities**: `debounce()`, `generateMessageId()`, `copyToClipboard()`, `parseMarkdown()`, `buildCurlCommand()`
- **Components**: `createCodeBlock()`, `createSystemPromptPresetSelector()`, `buildApiMessages()`
- **Theme system**: `THEME_DEFINITIONS`, `applyLLMTheme()` (also on `window`)
- **CSS injection**: Chat/component styles injected via `injectStyles()`
- **Constants**: `LLM_PROVIDERS`, `STATUS_EMOJI`, `DEFAULT_STATE`

#### `chat.js` — Chat Panel

Contains `ChatPanelFactory` — the chat interface for API documentation questions with SSE streaming, tool calling, error classification, and message rendering. Reads shared utilities from `window.DocBuddy` (aliased as `DB`).

#### `settings.js` — Settings Panel

Contains `LLMSettingsPanelFactory` — the settings form with provider presets, connection tester, theme configuration, system prompt presets, and tool calling options.

#### `workflow.js` — Workflow Panel

Contains `WorkflowPanelFactory` — the multi-step AI workflow builder with block chaining, tool calling, and output display.

#### `agent.js` — Agent Panel

Contains `AgentPanelFactory` — autonomous task execution agent with Plan/Act modes. Key features:
- **Plan mode**: LLM proposes a plan, no tool execution
- **Act mode**: Fully autonomous, auto-executes tool calls (bypasses `autoExecute` setting)
- `MAX_AGENT_ITERATIONS = 20` governs how many iterations before pausing
- `handleContinue()` resets iteration count and re-streams
- Fires `docbuddy-agent-streaming` custom events for tab indicator dots

#### `plugin.js` — Plugin Assembly & Tab Layout

Assembles `window.DocBuddyPlugin` from the `DocBuddy` namespace components: actions, reducer, selectors, component factories, and the tab navigation layout (`LLMDocsLayout`).

**Tab Layout Features:**
- **5 Tabs**: API Explorer, Chat, Workflow, Agent, Settings
- **All tabs always mounted** (hidden via `display:none`) to preserve state across tab switches
- **Tab Persistence**: Saves active tab to localStorage (`docbuddy-active-tab`)
- **Dynamic Height**: Chat, Agent, and Settings tabs use full available height (calc(100vh - 120px))
- **API Tab Scrolling**: API tab allows normal scrolling (no overscroll containment)
- **Streaming Indicators**: Pulsing dots on Chat/Workflow/Agent tabs when streaming in background

**Global Functions:**
- `window.llmSwitchTab(tabName)` — Switch tabs programmatically
- `window.llmOpenSettings()` — Open settings panel from external links

### Standalone Page (`docs/index.html`)

A self-contained GitHub Pages hosted page that loads DocBuddy from CDN, allowing users to explore any public OpenAPI schema without installing the Python package.

- **Dynamic script loading**: Detects `localhost`/`127.0.0.1` and loads local JS files (`../src/docbuddy/static/`) for development; uses jsDelivr CDN (`@main` branch) otherwise
- **URL classification**: Accepts direct `openapi.json` URLs or `/docs` page URLs (auto-detects schema via common path probing)
- **Schema caching**: Pre-fetches schema via `tryFetchSchema()` and primes `DocBuddy._cachedOpenapiSchema` to avoid redundant fetches
- **Shareable URLs**: Updates `?url=` query parameter for bookmarking/sharing loaded APIs
- **Local dev**: Run `python3 -m http.server 8080` from repo root, then open `http://localhost:8080/docs/index.html`

**CORS Limitation**: When using the GitHub Pages hosted version (`https://pearsonkyle.github.io/DocBuddy/`), you cannot connect to localhost LLMs (Ollama, LM Studio, vLLM) due to browser security restrictions. Browsers block web pages from making requests to `localhost`. To use localhost LLMs:

1. Run DocBuddy locally: `python3 -m http.server 8080` and visit `http://localhost:8080/docs/index.html`
2. Use the Python package (`pip install docbuddy`) instead of GitHub Pages

### Template (`src/docbuddy/templates/`)

- **`swagger_ui.html`** — Jinja2 template that:
  - Loads Swagger UI from CDN
  - Injects theme CSS immediately (prevents FOUC)
  - Loads the 5 modular DocBuddy JS files in order (hardcoded paths to `/docbuddy-static/`)
  - Injects JavaScript plugins in **correct order**:
    1. `SwaggerUIBundle.plugins.DownloadUrl`
    2. `DocBuddyPlugin` (assembled by `plugin.js`)
  - Supports dynamic URL injection via template parameters
  - Includes DOMPurify for safe HTML sanitization

### Theme Files (`src/docbuddy/static/themes/`)

- **`dark-theme.css`** — Default theme with dark background (`#0f172a`)
- **`light-theme.css`** — Light theme option (`#f7fafc`)

## Data Flow

### Chat Interaction Flow
1. User enters prompt in Chat panel
2. JavaScript fetches OpenAPI schema from `/openapi.json`
3. System prompt built from preset + OpenAPI context
4. Messages sent to LLM `/chat/completions` endpoint via SSE
5. Streaming response displayed in real-time
6. Markdown rendered with `marked.js` + DOMPurify

### Tool Calling Flow
1. LLM responds with tool call (JSON format)
2. Chat panel displays "api_request" message
3. User can edit parameters in tool call panel
4. API call executed with configured Authorization header
5. Tool result sent back to LLM for analysis

### Workflow Flow
1. User creates blocks with prompts/instructions
2. Click "Start" to execute workflow
3. Each block's output is chained to next block as context
4. Tool calls can be executed within workflow blocks
5. All outputs are displayed with click-to-copy

## Provider Presets

Defined in `core.js`:
- `ollama` — `http://localhost:11434/v1`
- `lmstudio` — `http://localhost:1234/v1`
- `vllm` — `http://localhost:8000/v1`
- `custom` — User-defined URL

## Build System

- **Hatchling** (PEP 517) for packaging. Static files and templates are force-included in wheel via `pyproject.toml`.
- **pytest** with `asyncio_mode = "auto"` and anyio for async support.

## localStorage Keys

The plugin uses the following keys to persist user preferences:

| Key | Purpose |
|-----|---------|
| `docbuddy-settings` | LLM configuration (baseUrl, apiKey, modelId, maxTokens, temperature, provider) |
| `docbuddy-chat-history` | Chat conversation history (last 20 messages) |
| `docbuddy-agent-history` | Agent conversation history |
| `docbuddy-theme` | Theme preferences (theme name + custom colors) |
| `docbuddy-active-tab` | Currently selected tab ("api", "chat", "workflow", or "settings") |
| `docbuddy-tool-settings` | Tool calling config (enableTools, autoExecute, apiKey) |
| `docbuddy-workflow` | Workflow panel block state |

**Note:** OpenAPI schema is NOT stored in localStorage to prevent quota exhaustion. It's re-fetched on each page load via `fetchOpenApiSchema()`.

## Styling & Theming System

### CSS Variables (`--theme-*`)

Both the static theme CSS files and JavaScript dynamically inject these variables into `:root`:

| Variable | Purpose |
|----------|---------|
| `--theme-primary` | Primary accent color (buttons, highlights) |
| `--theme-primary-hover` | Hover state for primary elements |
| `--theme-secondary` | Backgrounds, panels |
| `--theme-accent` | Text secondary color, borders |
| `--theme-background` | Page background |
| `--theme-panel-bg` | Panel/section backgrounds |
| `--theme-header-bg` | Header/bar backgrounds |
| `--theme-border-color` | Border colors |
| `--theme-text-primary` | Main text color |
| `--theme-text-secondary` | Secondary text color |
| `--theme-input-bg` | Input field backgrounds |

### Provider Colors

Specific to provider badges in templates:
- `--theme-provider-ollama: #2b90d8`
- `--theme-provider-vllm: #facc15`

### Theme Files

- **`themes/dark-theme.css`** — Default theme with dark background (`#0f172a`)
- **`themes/light-theme.css`** — Light theme option (`#f7fafc`)

### Dynamic Theming

The `applyLLMTheme()` function in JavaScript:
1. Merges theme defaults with custom colors
2. Updates or creates `<style id="docbuddy-theme-styles">` element
3. Applies immediately on DOM ready via `requestAnimationFrame()`
4. Template also injects initial theme to prevent FOUC

**Important for AI developers:** Theme colors should be changed through the UI's Theme Settings panel (which calls `applyLLMTheme()`), not by editing CSS files directly.

## System Prompt Presets

Defined in `system-prompt-config.json`:

| Preset | Name | Description |
|--------|------|-------------|
| `api_assistant` | API Assistant | Optimized for REST API documentation, can execute API calls via tool calling |
| `agent` | Agent | Autonomous task execution agent with clarify/plan/execute/deliver workflow |
| `custom` | Custom... | User-provided prompt text (supports `{openapi_context}` placeholder) |

The `{openapi_context}` placeholder is replaced with the formatted OpenAPI schema at send time.

**Async loading**: The config is fetched asynchronously. All panels (`chat.js`, `agent.js`, `workflow.js`) await both `ensureSystemPromptConfig()` and `ensureOpenapiSchemaCached()` via `Promise.all` before building the system prompt. The `SystemPromptPresetSelector` component (class-based) stores the config in state and re-renders when the async fetch completes.

**Fallback**: If `system-prompt-config.json` fails to load, `buildDefaultSystemPrompt()` provides a full fallback prompt with tool calling instructions and the `{openapi_context}` placeholder.

## Key Conventions for AI Developers

### JavaScript Code
1. **No build step** — Plain ES6+ (no JSX, no transpilation, no module bundler).
2. **IIFE pattern** — All modules wrapped in `(function () { ... })();` for scope isolation.
3. **Shared namespace** — `window.DocBuddy` is the shared namespace. Modules read from it as `var DB = window.DocBuddy;`.
4. **Global objects** — `window.DocBuddyPlugin`, `window.applyLLMTheme`, `window.llmOpenSettings`, `window.llmSwitchTab`.
5. **Browser compatibility** — Must work in modern browsers without polyfills.
6. **CDN dependencies** — marked.js and Swagger UI loaded from jsDelivr CDN, DOMPurify for security.
7. **AbortController pattern** — Use AbortController for request cancellation (streaming, tool calls).
8. **Debounce utility** — Use debounce function for connection testing to avoid rapid retries.

### CSS & Styling
1. **Theme variables first** — Use `var(--theme-*)` for all themeable colors.
2. **Scope CSS** — Prevent conflicts with `#llm-settings-panel` and `.llm-*` prefixes.
3. **Responsive design** — Include `@media (max-width: 768px)` rules for mobile.
4. **Color changes** — Update via UI Theme Settings panel, not hardcoded CSS.

### Python Backend
1. **Thread safety** — Use `_route_lock` for route modification to prevent duplicates.
2. **Weak reference tracking** — Use `weakref.WeakSet` for tracking apps to enable garbage collection.
3. **Route filtering** — Filter routes safely by creating new list, don't modify in place.
4. **CORS handling** — Client-side LLM calls work because local providers support CORS.
5. **Validation** — FastAPI dependencies use `Header(default=None)` for optional values.

### Plugin Registration Order
In `swagger_ui.html`, plugins must be registered in this order:
1. `SwaggerUIBundle.plugins.DownloadUrl`
2. `DocBuddyPlugin` (assembled by `plugin.js` from `window.DocBuddy` components)

The script loading order is critical:
1. `core.js` (creates `window.DocBuddy` namespace)
2. `chat.js`, `settings.js`, `workflow.js`, `agent.js` (any order among these)
3. `plugin.js` (assembles `window.DocBuddyPlugin` with layout)

Changing this order will break the UI.

### Template System
- Jinja2 used for HTML rendering.
- External JS/CSS URLs (e.g., Swagger UI CDN resources) are injected via template parameters; internal DocBuddy module paths are hardcoded in the template.
- `debug=True` enables auto-reload for development.
- FOUC fix: Theme injection script runs immediately in `<head>`.

## Best Practices for Contributors

### Code Quality
1. **Test first** — Add tests for new features in `tests/test_plugin.py`
2. **Update API docs** — Update README.md when functionality changes
3. **Check theme compatibility** — Test both dark and light themes
4. **Test concurrent setup** — Verify thread safety with multiple apps

### Testing Workflow
1. **Run tests after each change** — After making any code modifications, run `pytest tests/ -v` to verify nothing is broken
2. **Verify before completion** — Always confirm all tests pass before using `attempt_completion` to finalize a task
3. **Fix circular imports early** — When modifying module imports, check for circular import issues between `__init__.py` and other modules

### JavaScript Patterns
1. Use `var` for function-scoped variables (older pattern, compatible with all browsers)
2. Always use `AbortController` for cancellable async operations
3. **Security:** Validate all CSS color values against regex `/^#[0-9a-fA-F]{3,8}$|^rgba?\(/` before injection
4. **Security:** Always validate tool call paths start with `/` and prepend `window.location.origin`
5. **Security:** Use DOMPurify for HTML sanitization with defense-in-depth checks against `<script>` and event handler patterns
6. Use CSS variables for all themable values

### Python Patterns
1. Use `weakref.WeakSet` to avoid memory leaks from app references
2. Always use `_route_lock` when modifying routes
3. Create new route lists rather than mutating existing ones

### Version Control
- Update `version` in `pyproject.toml` for releases
- Update `__version__` in `src/docbuddy/__init__.py`
- Follow semantic versioning (MAJOR.MINOR.PATCH)

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/docbuddy/__init__.py` | Public API exports |
| `src/docbuddy/plugin.py` | Core Python plugin logic |
| `src/docbuddy/static/core.js` | Shared namespace, utilities, state, storage, OpenAPI helpers |
| `src/docbuddy/static/chat.js` | ChatPanel component |
| `src/docbuddy/static/settings.js` | LLMSettingsPanel component |
| `src/docbuddy/static/workflow.js` | WorkflowPanel component |
| `src/docbuddy/static/agent.js` | AgentPanel component (Plan/Act modes) |
| `src/docbuddy/static/plugin.js` | Plugin assembly, tab layout (combines namespace into DocBuddyPlugin) |
| `src/docbuddy/templates/swagger_ui.html` | Jinja2 template for docs page |
| `src/docbuddy/static/system-prompt-config.json` | System prompt presets configuration |
| `docs/index.html` | Standalone GitHub Pages page (loads DocBuddy from CDN or local) |
| `examples/demo_server.py` | Demo FastAPI server with sample endpoints |

#### JavaScript Patterns

**Namespace Initialization:**
```javascript
var DocBuddy = window.DocBuddy = {};
```

**Component Factory Pattern:**
```javascript
function ChatPanelFactory(system) {
  return class ChatPanel extends React.Component { ... }
}
DocBuddy.ChatPanelFactory = ChatPanelFactory;
```

**Storage Keys:**
- `docbuddy-settings` - LLM settings (baseUrl, apiKey, modelId)
- `docbuddy-chat-history` - Chat conversation history
- `docbuddy-agent-history` - Agent task history
- `docbuddy-workflow` - Workflow definitions
- `docbuddy-theme` - Theme preferences

---

## File Structure

```
.
├── src/
│   └── docbuddy/
│       ├── __init__.py          # Package exports
│       ├── plugin.py            # Core plugin logic (Python)
│       ├── static/              # Frontend assets
│       │   ├── core.js          # Shared utilities & namespace
│       │   ├── chat.js          # Chat panel component
│       │   ├── agent.js         # Agent panel with Plan/Act modes
│       │   ├── workflow.js      # Workflow builder panel
│       │   ├── settings.js      # LLM settings panel
│       │   ├── plugin.js        # Swagger UI plugin integration
│       │   ├── system-prompt-config.json  # AI prompt presets
│       │   └── themes/          # CSS themes
│       │       ├── dark-theme.css
│       │       ├── light-theme.css
│       │       └── swagger-overrides.css
│       └── templates/
│           └── swagger_ui.html  # Jinja2 template for docs page
├── tests/
│   └── test_plugin.py           # Comprehensive pytest suite (200+ tests)
├── examples/
│   ├── demo_server.py           # Example FastAPI app with DocBuddy
│   └── *.png                    # Feature screenshots
├── pyproject.toml               # Project configuration & dependencies
└── AGENTS.md                    # This file
```

---

## Frontend Architecture

### Core Module (`core.js`)

**System Prompt Presets:**
- `api_assistant` - General API assistant with tool calling
- `agent` - Autonomous task execution (Plan/Act workflow)

**Key Functions:**
| Function | Purpose |
|----------|---------|
| `buildOpenApiContext(schema)` | Generates OpenAPI context for system prompts |
| `buildCurlCommand(...)` | Builds curl commands from tool args |
| `buildApiRequestTool(schema)` | Creates tool definition for LLM tool calling |
| `parseMarkdown(text)` | Safely renders markdown with DOMPurify |
| `loadFromStorage()` / `saveToStorage()` | Settings persistence |
| `applyLLMTheme(theme, colors)` | Dynamic theme injection |

**LLM Provider Configs:**
```javascript
{
  ollama: { name: 'Ollama', url: 'http://localhost:11434/v1' },
  lmstudio: { name: 'LM Studio', url: 'http://localhost:1234/v1' },
  vllm: { name: 'vLLM', url: 'http://localhost:8000/v1' },
  custom: { name: 'Custom', url: '' }
}
```

### Agent Module (`agent.js`)

**Plan/Act Workflow:**
1. **Clarification Phase**: Ask up to 3 targeted questions
2. **Planning Phase**: Outline step-by-step plan with available tools
3. **Execution Phase**: Execute iteratively (max 5 tool calls)
4. **Delivery Phase**: Synthesize final output

**Key Features:**
- `toggleMode()` - Switch between Plan and Act modes
- `MAX_AGENT_ITERATIONS = 5` - Prevent infinite loops
- `handleExecuteToolCall()` - Execute API requests with validation
- `sendToolResult()` - Process tool results and continue streaming

### Chat Module (`chat.js`)

**Streaming Response Handling:**
```javascript
_streamLLMResponse(apiMessages, streamMsgId, fullSchema)
```

**Tool Calling Support:**
- Parses `tool_calls` from LLM responses
- Shows editable tool call panel before execution
- Supports auto-execute in Act mode

### Workflow Module (`workflow.js`)

**Block Types:**
- `prompt` - User message or instruction
- `llm` - LLM processing with system prompt
- `tool_call` - API request via tool calling
- `tool_result` - Tool execution result

**Features:**
- Drag-and-drop block reordering
- Block output display with code blocks
- Export workflow as JSON
- Per-block execution (run single block)

---

## Development

### Setting Up

```bash
# Clone and install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest tests/ -v --tb=short

# Run linters
pre-commit run --all-files
```

### Running Demo Server

```bash
uvicorn examples.demo_server:app --reload --host 0.0.0.0 --port 8000
```

Visit `http://localhost:8000/docs` to see DocBuddy in action.

---

## Testing Strategy

### Test Coverage (`tests/test_plugin.py`)
- **200+ tests** covering all functionality
- Uses `FastAPI.TestClient` for integration testing
- Tests verify HTML output, JavaScript inclusion, tab persistence

### Running Tests
```bash
pytest tests/ -v --tb=short
```

### Key Test Categories:
1. `setup_docs` parameter forwarding & route management
2. Template structural integrity (DOMPurify, marked.js, SRI)
3. Provider configuration (Ollama, LM Studio, vLLM)
4. JavaScript function existence checks
5. Thread safety tests
6. Theme CSS scoping
7. Local storage key verification
8. Agent tab functionality

---

## Common Tasks for AI Assistants

### Adding a New Feature

1. **Backend changes** (if needed):
   - Modify `src/docbuddy/plugin.py` or `__init__.py`
   - Update tests in `tests/test_plugin.py`

2. **Frontend changes**:
   - Add component to appropriate JS file (`chat.js`, `agent.js`, etc.)
   - Follow existing patterns and naming conventions
   - Ensure theme compatibility (use CSS variables)

3. **Testing**:
   - Add corresponding test cases
   - Run `pytest tests/` before committing

### Modifying System Prompts

Edit `src/docbuddy/static/system-prompt-config.json`:

```json
{
  "presets": {
    "preset_name": {
      "name": "Display Name",
      "description": "Brief description",
      "prompt": "Prompt template with {openapi_context} placeholder"
    }
  }
}
```

### Debugging

1. Enable debug mode: `setup_docs(app, debug=True)`
2. Check browser console for JavaScript errors
3. Verify static files are served at `/docbuddy-static/`
4. Check localStorage for saved settings

---

## Security Considerations

1. **XSS Protection**: DOMPurify sanitizes all markdown rendering
2. **Path Validation**: Tool calls reject paths containing `..` or non-relative URLs
3. **CORS Guidance**: LLM providers must enable CORS for browser access
4. **API Key Handling**: Keys stored in localStorage; never sent to server

---

## CI/CD Pipeline

### GitHub Actions Workflows

| Workflow | Purpose |
|----------|---------|
| `ci.yml` | Lint (pre-commit, ruff, mypy) and test on Python 3.9-3.12 |
| `publish-to-pypi.yml` | Publish to PyPI on release |
| `publish-to-testpypi.yml` | Publish to TestPyPI for testing |

### CI Requirements
- All tests must pass
- Pre-commit hooks run automatically
- Code coverage maintained

---

## LLM Provider Integration

### Supported Providers

| Provider | Default URL | Notes |
|----------|-------------|-------|
| Ollama | `http://localhost:11434/v1` | Local LLM server |
| LM Studio | `http://localhost:1234/v1` | Local LLM interface |
| vLLM | `http://localhost:8000/v1` | High-performance inference |
| Custom | User-defined | For any OpenAI-compatible API |

### Adding a New Provider

1. Add to `LLM_PROVIDERS` in `core.js`
2. Update settings panel UI if needed
3. Add test in `tests/test_plugin.py`

---

## Theme System

### Default Themes

**Dark Theme:**
- Background: `#0f172a`
- Panel BG: `#1f2937`
- Text Primary: `#f7fafc`

**Light Theme:**
- Background: `#f7fafc`
- Panel BG: `#ffffff`
- Text Primary: `#1a202c`

### Customizing Themes

Users can customize colors via the Settings panel. Colors are persisted to localStorage.

---

## Troubleshooting

### Common Issues

1. **LLM connection fails**
   - Check LLM provider settings in Settings tab
   - Ensure CORS is enabled on LLM provider
   - Verify provider URL and API key

2. **Tools not working**
   - Enable tools in Settings panel
   - Check API key has required permissions
   - Verify tool call parameters are valid JSON

3. **Changes not reflecting**
   - Clear browser cache or use incognito mode
   - Rebuild static files if developing locally
   - Restart dev server with `--reload`

---

## Contribution Guidelines

1. Follow existing code patterns and conventions
2. Add tests for new features
3. Update this document for significant changes
4. Run all tests before submitting PRs
5. Ensure pre-commit hooks pass

### Code Style

- Python: PEP 8 compliant (via ruff)
- JavaScript: Consistent with existing codebase
- Use CSS variables for theming
- Keep functions focused and testable

---

## CI/CD Pipeline

### GitHub Actions Workflows

| Workflow | Purpose |
|----------|---------|
| `ci.yml` | Lint (pre-commit, ruff, mypy) and test on Python 3.9-3.12 with coverage |
| `release.yml` | Auto-publish to PyPI on version tags with release notes |
| `publish-to-pypi.yml` | Manual dispatch to publish to PyPI (legacy) |
| `publish-to-testpypi.yml` | Manual dispatch to publish to TestPyPI (legacy) |

### CI Features
- **4 Python versions tested**: 3.9, 3.10, 3.11, 3.12
- **Test coverage reporting** with Codecov integration
- **Security scanning** using Bandit (static analysis)
- **Dependency review** on pull requests
- **Documentation verification** on every PR

### Release Process
1. Tag commit with `vX.Y.Z` (semantic versioning)
2. CI validates version and builds package
3. Tests publish to TestPyPI first (optional)
4. Package uploads to PyPI automatically
5. GitHub Release created with changelog

---

## Additional Resources

- **PyPI**: https://pypi.org/project/docbuddy/
- **GitHub**: https://github.com/pearsonkyle/docbuddy
- **License**: MIT
- **Python Versions**: 3.9, 3.10, 3.11, 3.12

---

*Last updated: Generated by AI assistant*
