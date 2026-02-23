// LLM Settings Swagger UI Plugin
// Adds statePlugins.llmSettings and components.LLMSettingsPanel

(function () {
  "use strict";

  // ── LLM Provider configurations ─────────────────────────────────────────────
  var LLM_PROVIDERS = {
    openai: { name: 'OpenAI', url: 'https://api.openai.com/v1' },
    anthropic: { name: 'Anthropic', url: 'https://api.anthropic.com/v1' },
    ollama: { name: 'Ollama', url: 'http://localhost:11434/v1' },
    lmstudio: { name: 'LM Studio', url: 'http://localhost:1234/v1' },
    vllm: { name: 'vLLM', url: 'http://localhost:8000/v1' },
    azure: { name: 'Azure OpenAI', url: 'https://YOUR_RESOURCE_NAME.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT' },
    custom: { name: 'Custom', url: '' }
  };

  // ── Action types ────────────────────────────────────────────────────────────
  var SET_BASE_URL = "LLM_SET_BASE_URL";
  var SET_API_KEY = "LLM_SET_API_KEY";
  var SET_MODEL_ID = "LLM_SET_MODEL_ID";
  var SET_MAX_TOKENS = "LLM_SET_MAX_TOKENS";
  var SET_TEMPERATURE = "LLM_SET_TEMPERATURE";
  var SET_CONNECTION_STATUS = "LLM_SET_CONNECTION_STATUS";
  var SET_PROVIDER = "LLM_SET_PROVIDER";
  var SET_SETTINGS_OPEN = "LLM_SET_SETTINGS_OPEN";
  var ADD_CHAT_MESSAGE = "LLM_ADD_CHAT_MESSAGE";
  var CLEAR_CHAT_HISTORY = "LLM_CLEAR_CHAT_HISTORY";
  var SET_OPENAPI_SCHEMA = "LLM_SET_OPENAPI_SCHEMA";

  // ── Default state ───────────────────────────────────────────────────────────
  var STORAGE_KEY = "swagger-llm-settings";
  var CHAT_HISTORY_KEY = "swagger-llm-chat-history";

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveToStorage(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // ignore
    }
  }

  function loadChatHistory() {
    try {
      var raw = localStorage.getItem(CHAT_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveChatHistory(messages) {
    try {
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-20))); // Keep last 20
    } catch (e) {
      // ignore
    }
  }

  var stored = loadFromStorage();

  var DEFAULT_STATE = {
    baseUrl: stored.baseUrl || "https://api.openai.com/v1",
    apiKey: stored.apiKey || "",
    modelId: stored.modelId || "gpt-4",
    maxTokens: stored.maxTokens != null ? stored.maxTokens : 4096,
    temperature: stored.temperature != null ? stored.temperature : 0.7,
    provider: stored.provider || "openai",
    connectionStatus: "disconnected", // disconnected | connecting | connected | error
    settingsOpen: false,
    chatHistory: loadChatHistory(),
    lastError: "",
  };

  // ── Debounce utility ───────────────────────────────────────────────────────
  function debounce(fn, delay) {
    var timeoutId;
    return function () {
      var self = this;
      var args = arguments;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(function () {
        fn.apply(self, args);
      }, delay);
    };
  }

  // ── Helper to dispatch via Swagger UI's auto-generated action dispatchers ──
  function dispatchAction(system, actionName, value) {
    var sys = system && typeof system.getSystem === 'function' ? system.getSystem() : null;
    if (sys && sys.llmSettingsActions && typeof sys.llmSettingsActions[actionName] === 'function') {
      sys.llmSettingsActions[actionName](value);
    }
  }

  // ── Reducer ─────────────────────────────────────────────────────────────────
  function llmSettingsReducer(state, action) {
    if (state === undefined) state = DEFAULT_STATE;
    switch (action.type) {
      case SET_BASE_URL:
        return Object.assign({}, state, { baseUrl: action.payload });
      case SET_API_KEY:
        return Object.assign({}, state, { apiKey: action.payload });
      case SET_MODEL_ID:
        return Object.assign({}, state, { modelId: action.payload });
      case SET_MAX_TOKENS:
        var val = action.payload;
        // Only update if it's a valid non-empty number
        if (val === '' || val === null || val === undefined) {
          return state;
        }
        var num = Number(val);
        if (!isNaN(num)) {
          return Object.assign({}, state, { maxTokens: num });
        }
        return state;
      case SET_TEMPERATURE:
        var temp = action.payload;
        if (temp === '' || temp === null || temp === undefined) {
          return state;
        }
        var numTemp = Number(temp);
        if (!isNaN(numTemp)) {
          return Object.assign({}, state, { temperature: numTemp });
        }
        return state;
      case SET_CONNECTION_STATUS:
        return Object.assign({}, state, { connectionStatus: action.payload });
      case SET_PROVIDER:
        var provider = LLM_PROVIDERS[action.payload] || LLM_PROVIDERS.custom;
        return Object.assign({}, state, {
          provider: action.payload,
          baseUrl: provider.url
        });
      case SET_SETTINGS_OPEN:
        return Object.assign({}, state, { settingsOpen: action.payload });
      case ADD_CHAT_MESSAGE:
        // state may be an Immutable Map (Swagger UI wraps reducer state)
        var existingHistory = state.get ? state.get("chatHistory") : state.chatHistory;
        // Convert Immutable List to plain array if needed
        if (existingHistory && typeof existingHistory.toJS === 'function') {
          existingHistory = existingHistory.toJS();
        }
        var newHistory = Array.isArray(existingHistory)
          ? existingHistory.concat([action.payload])
          : [action.payload];
        saveChatHistory(newHistory);
        return Object.assign({}, state, { chatHistory: newHistory });
      case CLEAR_CHAT_HISTORY:
        saveChatHistory([]);
        return Object.assign({}, state, { chatHistory: [] });
      case SET_OPENAPI_SCHEMA:
        return Object.assign({}, state, { openapiSchema: action.payload });
      default:
        return state;
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  var actions = {
    setBaseUrl: function (value) { return { type: SET_BASE_URL, payload: value }; },
    setApiKey: function (value) { return { type: SET_API_KEY, payload: value }; },
    setModelId: function (value) { return { type: SET_MODEL_ID, payload: value }; },
    setMaxTokens: function (value) { return { type: SET_MAX_TOKENS, payload: value }; },
    setTemperature: function (value) { return { type: SET_TEMPERATURE, payload: value }; },
    setConnectionStatus: function (value) { return { type: SET_CONNECTION_STATUS, payload: value }; },
    setProvider: function (value) { return { type: SET_PROVIDER, payload: value }; },
    setSettingsOpen: function (value) { return { type: SET_SETTINGS_OPEN, payload: value }; },
    addChatMessage: function (message) { return { type: ADD_CHAT_MESSAGE, payload: message }; },
    clearChatHistory: function () { return { type: CLEAR_CHAT_HISTORY }; },
    setOpenApiSchema: function (schema) { return { type: SET_OPENAPI_SCHEMA, payload: schema }; },
  };

  // ── Selectors ───────────────────────────────────────────────────────────────
  var selectors = {
    getBaseUrl: function (state) { return state.get ? state.get("baseUrl") : state.baseUrl; },
    getApiKey: function (state) { return state.get ? state.get("apiKey") : state.apiKey; },
    getModelId: function (state) { return state.get ? state.get("modelId") : state.modelId; },
    getMaxTokens: function (state) { return state.get ? state.get("maxTokens") : state.maxTokens; },
    getTemperature: function (state) { return state.get ? state.get("temperature") : state.temperature; },
    getConnectionStatus: function (state) { return state.get ? state.get("connectionStatus") : state.connectionStatus; },
    getProvider: function (state) { return state.get ? state.get("provider") : state.provider; },
    getSettingsOpen: function (state) { return state.get ? state.get("settingsOpen") : state.settingsOpen; },
    getChatHistory: function (state) { return state.get ? state.get("chatHistory") : state.chatHistory || []; },
    getOpenApiSchema: function (state) { return state.get ? state.get("openapiSchema") : state.openapiSchema; },
    getLastError: function (state) { return state.get ? state.get("lastError") : state.lastError; },
  };

  // ── Status indicator ───────────────────────────────────────────────────────
  var STATUS_EMOJI = {
    disconnected: "⚪",
    connecting: "🟡",
    connected: "🟢",
    error: "🔴",
  };

  // ── Provider badge generator ───────────────────────────────────────────────
  function getProviderBadge(providerKey) {
    var provider = LLM_PROVIDERS[providerKey] || LLM_PROVIDERS.custom;
    var className = 'llm-provider-' + (providerKey === 'custom' ? 'openai' : providerKey);
    return React.createElement(
      "span",
      { className: "llm-provider-badge " + className },
      provider.name
    );
  }

  // ── OpenAPI schema summary for chat context ────────────────────────────────
  function getSchemaSummary(schema) {
    if (!schema || typeof schema !== 'object') return '';

    var lines = [];
    var info = schema.info || {};
    lines.push('## API: ' + (info.title || 'Untitled') + ' v' + (info.version || '?'));
    if (info.description) {
      lines.push(info.description.substring(0, 500));
    }
    lines.push('');
    lines.push('## Endpoints');

    if (schema.paths) {
      Object.keys(schema.paths).forEach(function (path) {
        var methods = schema.paths[path];
        if (typeof methods !== 'object') return;

        Object.keys(methods).forEach(function (method) {
          if (method === 'parameters') return; // skip path-level params
          var spec = methods[method];
          if (typeof spec !== 'object') return;

          var line = '- ' + method.toUpperCase() + ' ' + path;
          if (spec.summary) line += ' — ' + spec.summary;
          lines.push(line);

          // Parameters
          var params = spec.parameters || [];
          if (params.length > 0) {
            var paramDescs = params.map(function (p) {
              return p.name + ' (' + (p.in || '?') + ', ' + (p.required ? 'required' : 'optional') + ')';
            });
            lines.push('  - Params: ' + paramDescs.join(', '));
          } else {
            lines.push('  - No parameters');
          }

          // Request body
          if (spec.requestBody && spec.requestBody.content) {
            var contentTypes = Object.keys(spec.requestBody.content);
            if (contentTypes.length > 0) {
              var bodySchema = spec.requestBody.content[contentTypes[0]].schema;
              if (bodySchema && bodySchema.properties) {
                var props = Object.keys(bodySchema.properties).map(function (k) {
                  var p = bodySchema.properties[k];
                  return k + ': ' + (p.type || 'any');
                });
                lines.push('  - Body: { ' + props.join(', ') + ' }');
              }
            }
          }
        });
      });
    }

    return lines.join('\n');
  }

  // ── Chat panel component ───────────────────────────────────────────────────
  function ChatPanelFactory(system) {
    var React = system.React;

    return class ChatPanel extends React.Component {
      constructor(props) {
        super(props);
        this.state = {
          input: "",
          isTyping: false,
          streamingContent: null,
          streamingTimestamp: null,
          chatHistory: loadChatHistory(),
          schemaSummary: null,
          schemaLoading: false,
        };
        this.handleSend = this.handleSend.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.clearHistory = this.clearHistory.bind(this);
      }

      componentDidMount() {
        this.fetchOpenApiSchema();
      }

      fetchOpenApiSchema() {
        var self = this;
        self.setState({ schemaLoading: true });
        fetch("/openapi.json")
          .then(function (res) { return res.json(); })
          .then(function (schema) {
            var summary = getSchemaSummary(schema);
            self.setState({ schemaSummary: summary, schemaLoading: false });
            dispatchAction(system, 'setOpenApiSchema', schema);
          })
          .catch(function () {
            self.setState({ schemaSummary: '', schemaLoading: false });
          });
      }

      addMessage(msg) {
        this.setState(function (prev) {
          var updated = prev.chatHistory.concat([msg]);
          saveChatHistory(updated);
          return { chatHistory: updated };
        });
      }

      handleInputChange(e) {
        this.setState({ input: e.target.value });
      }

      handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSend();
        }
      }

      handleSend() {
        if (!this.state.input.trim() || this.state.isTyping) return;

        var self = this;
        var userInput = this.state.input.trim();
        var streamTs = Date.now() + 1;

        // Add user message to local state immediately
        var userMsg = { role: 'user', content: userInput, timestamp: Date.now() };
        self.addMessage(userMsg);
        self.setState({ input: "", isTyping: true, streamingContent: "", streamingTimestamp: streamTs });

        // Build API messages from local state (includes the user message we just added)
        var apiMessages = self.state.chatHistory.concat([userMsg]).map(function (m) {
          return { role: m.role, content: m.content };
        });

        var settings = loadFromStorage();

        function scrollToBottom() {
          var el = document.getElementById('llm-chat-messages');
          if (el) el.scrollTop = el.scrollHeight;
        }

        function finalize(content) {
          self.addMessage({ role: 'assistant', content: content, timestamp: streamTs });
          self.setState({ isTyping: false, streamingContent: null, streamingTimestamp: null });
          setTimeout(scrollToBottom, 30);
        }

        fetch("/llm-chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-LLM-Base-Url": settings.baseUrl || "",
            "X-LLM-Api-Key": settings.apiKey || "",
            "X-LLM-Model-Id": settings.modelId || "",
            "X-LLM-Max-Tokens": settings.maxTokens != null ? String(settings.maxTokens) : "",
            "X-LLM-Temperature": settings.temperature != null ? String(settings.temperature) : "",
          },
          body: JSON.stringify({
            messages: apiMessages,
            openapi_summary: self.state.schemaSummary || ""
          })
        })
          .then(function (res) {
            if (!res.ok) {
              throw new Error("HTTP " + res.status + ": " + res.statusText);
            }
            var reader = res.body.getReader();
            var decoder = new TextDecoder();
            var accumulated = "";
            var buffer = "";

            function processChunk() {
              return reader.read().then(function (result) {
                if (result.done) {
                  finalize(accumulated || "Sorry, I couldn't get a response.");
                  return;
                }

                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (var i = 0; i < lines.length; i++) {
                  var line = lines[i].trim();
                  if (!line || !line.startsWith("data: ")) continue;
                  var payload = line.substring(6);

                  if (payload === "[DONE]") {
                    finalize(accumulated || "Sorry, I couldn't get a response.");
                    return;
                  }

                  try {
                    var chunk = JSON.parse(payload);
                    if (chunk.error) {
                      finalize("Error: " + chunk.error + (chunk.details ? ": " + chunk.details : ""));
                      return;
                    }
                    if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                      accumulated += chunk.choices[0].delta.content;
                      self.setState({ streamingContent: accumulated });
                      scrollToBottom();
                    }
                  } catch (e) {
                    // skip unparseable chunks
                  }
                }

                return processChunk();
              });
            }

            return processChunk();
          })
          .catch(function (err) {
            finalize("Error: " + (err.message || "Request failed"));
          });

        setTimeout(scrollToBottom, 50);
      }

      clearHistory() {
        saveChatHistory([]);
        this.setState({ chatHistory: [] });
      }

      renderMessage(msg) {
        var React = system.React;
        var isUser = msg.role === 'user';
        return React.createElement(
          "div",
          { key: msg.timestamp, className: "llm-chat-message " + (isUser ? 'user' : 'assistant') },
          React.createElement(
            "div",
            { className: "llm-chat-message-header" },
            isUser ? "You" : "Assistant",
            React.createElement(
              "span",
              { className: "llm-chat-message-time" },
              new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            )
          ),
          React.createElement(
            "div",
            { className: "llm-chat-message-content" },
            this.formatMessageContent(msg.content)
          )
        );
      }

      formatMessageContent(content) {
        var React = system.React;
        var lines = content.split('\n');
        return React.createElement(
          "div",
          null,
          lines.map(function (line, idx) {
            if (line.startsWith('```')) return null;
            return React.createElement("p", { key: idx, style: { margin: '4px 0' } }, line);
          })
        );
      }

      render() {
        var React = system.React;
        var self = this;
        var chatHistory = this.state.chatHistory || [];

        return React.createElement(
          "div",
          { style: styles.chatContainer },
          React.createElement(
            "div",
            { id: "llm-chat-messages", style: styles.chatMessages },
            chatHistory.length === 0 && !this.state.streamingContent
              ? React.createElement(
                  "div",
                  { style: styles.emptyChat },
                  "Ask questions about your API!\n\nExamples:\n\u2022 What endpoints are available?\n\u2022 How do I use the chat completions endpoint?\n\u2022 Generate a curl command for /health"
                )
              : [].concat(
                  chatHistory.map(this.renderMessage.bind(this)),
                  this.state.streamingContent != null
                    ? [this.renderMessage({
                        role: 'assistant',
                        content: this.state.streamingContent || "...",
                        timestamp: this.state.streamingTimestamp || 0
                      })]
                    : []
                )
            ),
          this.state.isTyping && !this.state.streamingContent
            ? React.createElement(
                "div",
                { style: { padding: "8px 12px", color: "#9ca3af", fontSize: "12px", fontStyle: "italic" } },
                "Thinking..."
              )
            : null,
          React.createElement(
            "div",
            { style: styles.chatInputArea },
            React.createElement("textarea", {
              value: this.state.input,
              onChange: this.handleInputChange,
              onKeyDown: this.handleKeyDown,
              placeholder: "Ask about your API... (Shift+Enter for new line)",
              style: styles.chatInput,
              rows: 2
            }),
            React.createElement(
              "div",
              { style: styles.chatControls },
              React.createElement(
                "button",
                {
                  onClick: this.clearHistory,
                  style: styles.smallButton,
                  title: "Clear chat history"
                },
                "Clear"
              ),
              React.createElement(
                "button",
                {
                  onClick: this.handleSend,
                  disabled: !this.state.input.trim() || this.state.isTyping,
                  style: Object.assign({}, styles.sendButton, {
                    opacity: (!this.state.input.trim() || this.state.isTyping) ? 0.5 : 1
                  })
                },
                this.state.isTyping ? "..." : "Send"
              )
            )
          )
        );
      }
    };
  }

  // ── LLMSettingsPanel component ───────────────────────────────────────────────
  function LLMSettingsPanelFactory(system) {
    var React = system.React;

    return class LLMSettingsPanel extends React.Component {
      constructor(props) {
        super(props);
        var s = loadFromStorage();
        this.state = {
          baseUrl: s.baseUrl || DEFAULT_STATE.baseUrl,
          apiKey: s.apiKey || DEFAULT_STATE.apiKey,
          modelId: s.modelId || DEFAULT_STATE.modelId,
          maxTokens: s.maxTokens != null && s.maxTokens !== '' ? s.maxTokens : DEFAULT_STATE.maxTokens,
          temperature: s.temperature != null && s.temperature !== '' ? s.temperature : DEFAULT_STATE.temperature,
          provider: s.provider || DEFAULT_STATE.provider,
          connectionStatus: "disconnected",
          settingsOpen: false,
          lastError: "",
        };
        this.handleSaveAndTest = debounce(this.handleSaveAndTest.bind(this), 500);
        this.toggleOpen = this.toggleOpen.bind(this);
        this.handleConnectionTest = debounce(this.handleConnectionTest.bind(this), 500);
      }

      handleSaveAndTest() {
        var self = this;
        var settings = {
          baseUrl: this.state.baseUrl,
          apiKey: this.state.apiKey,
          modelId: this.state.modelId,
          maxTokens: this.state.maxTokens !== '' ? this.state.maxTokens : null,
          temperature: this.state.temperature !== '' ? this.state.temperature : null,
          provider: this.state.provider,
        };
        saveToStorage(settings);
        self.setState({ connectionStatus: "connecting", lastError: "" });
        dispatchAction(system, 'setConnectionStatus', "connecting");

        // Route through backend proxy to avoid CORS
        fetch("/models", {
          method: 'GET',
          headers: {
            "Content-Type": "application/json",
            "X-LLM-Base-Url": settings.baseUrl || "",
            "X-LLM-Api-Key": settings.apiKey || "",
            "X-LLM-Model-Id": settings.modelId || "",
          }
        })
          .then(function (res) {
            if (!res.ok) {
              throw new Error('HTTP ' + res.status + ': ' + res.statusText);
            }
            return res.json();
          })
          .then(function (data) {
            self.setState({ connectionStatus: "connected" });
            dispatchAction(system, 'setConnectionStatus', "connected");
          })
          .catch(function (err) {
            var errorMsg = err.message || "Connection failed";
            self.setState({ connectionStatus: "error", lastError: errorMsg });
            dispatchAction(system, 'setConnectionStatus', "error");
          });
      }

      handleConnectionTest() {
        this.handleSaveAndTest();
      }

      toggleOpen() {
        var newValue = !this.state.settingsOpen;
        this.setState({ settingsOpen: newValue });
        dispatchAction(system, 'setSettingsOpen', newValue);
      }

      handleProviderChange(e) {
        var value = e.target.value;
        var provider = LLM_PROVIDERS[value] || LLM_PROVIDERS.custom;
        this.setState({ provider: value, baseUrl: provider.url });
        dispatchAction(system, 'setProvider', value);
      }

      handleBaseUrlChange(e) {
        this.setState({ baseUrl: e.target.value });
        dispatchAction(system, 'setBaseUrl', e.target.value);
      }

      handleApiKeyChange(e) {
        this.setState({ apiKey: e.target.value });
        dispatchAction(system, 'setApiKey', e.target.value);
      }

      handleModelIdChange(e) {
        this.setState({ modelId: e.target.value });
        dispatchAction(system, 'setModelId', e.target.value);
      }

      handleMaxTokensChange(e) {
        this.setState({ maxTokens: e.target.value });
        dispatchAction(system, 'setMaxTokens', e.target.value);
      }

      handleTemperatureChange(e) {
        this.setState({ temperature: e.target.value });
        dispatchAction(system, 'setTemperature', e.target.value);
      }

      render() {
        var self = this;
        var s = this.state;
        var React = system.React;

        var statusEmoji = STATUS_EMOJI[s.connectionStatus] || "⚪";
        var provider = LLM_PROVIDERS[s.provider] || LLM_PROVIDERS.custom;

        // Input styling
        var inputStyle = {
          background: "#1f2937",
          border: "1px solid #374151",
          borderRadius: "4px",
          color: "#e5e7eb",
          padding: "6px 10px",
          width: "100%",
          boxSizing: "border-box",
          fontSize: "13px",
        };

        var labelStyle = { color: "#9ca3af", fontSize: "12px", marginBottom: "4px", display: "block" };
        var fieldStyle = { marginBottom: "12px" };

        // Provider preset dropdown
        var providerOptions = Object.keys(LLM_PROVIDERS).map(function (key) {
          return React.createElement(
            "option",
            { key: key, value: key },
            LLM_PROVIDERS[key].name
          );
        });

        // Provider selection field
        var providerField = React.createElement(
          "div",
          { style: fieldStyle },
          React.createElement("label", { style: labelStyle }, "LLM Provider"),
          React.createElement(
            "select",
            {
              value: s.provider,
              onChange: this.handleProviderChange.bind(this),
              style: inputStyle
            },
            providerOptions
          )
        );

        // Provider badge
        var providerBadge = React.createElement(
          "span",
          { className: "llm-provider-badge llm-provider-" + (s.provider === 'custom' ? 'openai' : s.provider), style: { fontSize: "10px", padding: "2px 8px", background: "#374151", borderRadius: "10px", color: "#9ca3af", marginLeft: "8px" } },
          provider.name
        );

        // Base URL field
        var baseUrlField = React.createElement(
          "div",
          { style: fieldStyle },
          React.createElement("label", { style: labelStyle }, "Base URL"),
          React.createElement(
            "div",
            { style: { display: "flex", alignItems: "center" } },
            React.createElement("input", {
              type: "text",
              value: s.baseUrl,
              style: Object.assign({}, inputStyle, { flex: 1 }),
              onChange: this.handleBaseUrlChange.bind(this),
            }),
            provider.name !== 'Custom' && React.createElement(
              "span",
              { style: { marginLeft: "8px", fontSize: "10px", color: "#6b7280" } },
              provider.url
            )
          )
        );

        var fields = React.createElement(
          "div",
          { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" } },
          providerField,
          baseUrlField,
          React.createElement(
            "div",
            { style: fieldStyle },
            React.createElement("label", { style: labelStyle }, "API Key"),
            React.createElement("input", {
              type: "password",
              value: s.apiKey,
              placeholder: "sk-...",
              style: inputStyle,
              onChange: this.handleApiKeyChange.bind(this),
            })
          ),
          React.createElement(
            "div",
            { style: fieldStyle },
            React.createElement("label", { style: labelStyle }, "Model ID"),
            React.createElement("input", {
              type: "text",
              value: s.modelId,
              style: inputStyle,
              onChange: this.handleModelIdChange.bind(this),
            })
          ),
          React.createElement(
            "div",
            { style: fieldStyle },
            React.createElement("label", { style: labelStyle }, "Max Tokens"),
            React.createElement("input", {
              type: "number",
              value: s.maxTokens !== '' ? s.maxTokens : "",
              min: 1,
              placeholder: "4096",
              style: inputStyle,
              onChange: this.handleMaxTokensChange.bind(this),
            })
          ),
          React.createElement(
            "div",
            { style: fieldStyle },
            React.createElement("label", { style: labelStyle }, "Temperature (0 – 2)"),
            React.createElement("input", {
              type: "number",
              value: s.temperature !== '' ? s.temperature : "",
              min: 0,
              max: 2,
              step: 0.1,
              placeholder: "0.7",
              style: inputStyle,
              onChange: this.handleTemperatureChange.bind(this),
            })
          )
        );

        var saveButton = React.createElement(
          "button",
          {
            onClick: this.handleSaveAndTest,
            style: {
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "8px 18px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: "600",
            },
          },
          "Save & Test Connection"
        );

        var testButton = React.createElement(
          "button",
          {
            onClick: this.handleConnectionTest,
            style: {
              background: "#4b5563",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: "12px",
              marginLeft: "8px",
            },
          },
          "Test"
        );

        var statusBadge = React.createElement(
          "span",
          {
            style: {
              marginLeft: "12px",
              fontSize: "13px",
              color: s.connectionStatus === "error" ? "#f87171" : "#9ca3af",
              verticalAlign: "middle",
            },
          },
          React.createElement(
            "span",
            { style: { marginRight: "4px" } },
            statusEmoji
          ),
          s.connectionStatus === "error"
            ? React.createElement(
                "span",
                { title: s.lastError, style: { cursor: "help", borderBottom: "1px dashed #f87171" } },
                s.lastError || "Connection failed"
              )
            : s.connectionStatus
        );

        var header = React.createElement(
          "div",
          {
            onClick: this.toggleOpen,
            style: {
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              padding: "10px 16px",
              background: "#111827",
              borderBottom: s.settingsOpen ? "1px solid #374151" : "none",
              userSelect: "none",
            },
          },
          React.createElement("span", { style: { fontSize: "16px", marginRight: "8px" } }, "🤖"),
          React.createElement(
            "span",
            { style: { fontWeight: "600", color: "#e5e7eb", fontSize: "14px", flexGrow: 1 } },
            "LLM Settings"
          ),
          providerBadge,
          React.createElement(
            "span",
            { style: { color: "#6b7280", fontSize: "12px", cursor: "pointer" } },
            s.settingsOpen ? "▲ collapse" : "▼ expand"
          )
        );

        var body = s.settingsOpen
          ? React.createElement(
              "div",
              { style: { padding: "16px", background: "#1f2937" } },
              fields,
              React.createElement(
                "div",
                { style: { display: "flex", alignItems: "center", marginTop: "8px" } },
                saveButton,
                testButton,
                statusBadge
              ),
              React.createElement(
                "div",
                { style: { marginTop: "12px", padding: "10px", background: "#374151", borderRadius: "4px" } },
                React.createElement(
                  "div",
                  { style: { fontSize: "12px", fontWeight: "600", color: "#e5e7eb", marginBottom: "8px" } },
                  "Quick Actions"
                ),
                React.createElement(
                  "div",
                  { style: { display: "flex", gap: "8px" } },
                  React.createElement(
                    "button",
                    {
                      onClick: function () { self.setState({ settingsOpen: false }); },
                      style: {
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px 12px",
                        cursor: "pointer",
                        fontSize: "11px"
                      }
                    },
                    "Hide Panel"
                  ),
                  React.createElement(
                    "button",
                    {
                      onClick: function () { window.ui.specActions.download(); },
                      style: {
                        background: "#4b5563",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px 12px",
                        cursor: "pointer",
                        fontSize: "11px"
                      }
                    },
                    "Download OpenAPI"
                  )
                )
              )
            )
          : null;

        return React.createElement(
          "div",
          {
            id: "llm-settings-panel",
            style: {
              fontFamily: "'Inter', 'Segoe UI', sans-serif",
              border: "1px solid #374151",
              borderRadius: "6px",
              margin: "0 0 16px 0",
              overflow: "hidden",
            },
          },
          header,
          body
        );
      }
    };
  }

  // ── CSS styles object ───────────────────────────────────────────────────────
  var styles = {
    chatContainer: {
      display: "flex",
      flexDirection: "column",
      height: "400px",
    },
    chatMessages: {
      flex: 1,
      overflowY: "auto",
      padding: "12px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    },
    chatMessage: {
      display: "flex",
      flexDirection: "column",
      padding: "8px",
      borderRadius: "8px",
      maxWidth: "90%",
    },
    chatMessageUser: {
      alignSelf: "flex-end",
      background: "#2563eb",
      color: "#fff",
    },
    chatMessageAssistant: {
      alignSelf: "flex-start",
      background: "#374151",
      color: "#e5e7eb",
    },
    chatMessageHeader: {
      fontSize: "10px",
      marginBottom: "4px",
      opacity: 0.7,
    },
    chatMessageContent: {
      fontSize: "13px",
      lineHeight: "1.5",
    },
    chatInputArea: {
      borderTop: "1px solid #374151",
      padding: "12px",
    },
    chatInput: {
      width: "100%",
      background: "#1f2937",
      border: "1px solid #374151",
      borderRadius: "4px",
      color: "#e5e7eb",
      padding: "8px 10px",
      fontSize: "13px",
      resize: "none",
      fontFamily: "'Inter', sans-serif",
    },
    chatControls: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: "8px",
    },
    smallButton: {
      background: "#4b5563",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      padding: "4px 10px",
      cursor: "pointer",
      fontSize: "10px",
    },
    sendButton: {
      background: "#2563eb",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      padding: "6px 16px",
      cursor: "pointer",
      fontSize: "12px",
    },
    emptyChat: {
      textAlign: "center",
      color: "#9ca3af",
      padding: "40px 20px",
      fontSize: "13px",
      whiteSpace: "pre-line",
    },
  };

  // ── Plugin definition ───────────────────────────────────────────────────────
  window.LLMSettingsPlugin = function (system) {
    return {
      statePlugins: {
        llmSettings: {
          actions: actions,
          reducers: { llmSettings: llmSettingsReducer },
          selectors: selectors,
        },
      },
      components: {
        LLMSettingsPanel: LLMSettingsPanelFactory(system),
        ChatPanel: ChatPanelFactory(system),
      },
    };
  };
})();
