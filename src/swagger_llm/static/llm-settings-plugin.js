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

  // ── Markdown parser initialization (marked.js) ────────────────────────────
  var marked = null;
  function initMarked() {
    if (marked) return marked;
    
    // Load marked.js from CDN if not already loaded
    if (typeof window.marked !== 'undefined') {
      marked = window.marked;
      return marked;
    }
    
    // Create script element to load marked.js
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked@9/marked.min.js';
    script.async = true;
    document.head.appendChild(script);
    
    // Wait for marked to load
    var promise = new Promise(function(resolve) {
      var checkLoaded = function() {
        if (window.marked) {
          marked = window.marked;
          resolve(marked);
        } else {
          setTimeout(checkLoaded, 100);
        }
      };
      checkLoaded();
    });
    
    return promise;
  }

  // ── Parse Markdown safely ─────────────────────────────────────────────────
  function parseMarkdown(text) {
    if (!text || typeof text !== 'string') return '';

    // Sanitize: strip dangerous tags and attributes
    var sanitized = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed[^>]*>/gi, '')
      .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '');

    try {
      if (marked) {
        var html = marked.parse(sanitized);
        // Strip event handler attributes and javascript: URLs from parsed output
        html = html
          .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
          .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
          .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, 'src=""');
        return html;
      }
    } catch (e) {
      console.error('Markdown parsing error:', e);
    }

    // Fallback: simple line break conversion
    return sanitized.replace(/\n/g, '<br>');
  }

  // ── Theme default configurations ─────────────────────────────────────────────
  var THEME_DEFINITIONS = {
    dark: {
      name: 'Dark',
      primary: '#1d4ed8',
      primaryHover: '#1e40af',
      secondary: '#2d3748',
      accent: '#718096',
      background: '#0f172a',
      panelBg: '#1f2937',
      headerBg: '#111827',
      borderColor: '#4a5568',
      textPrimary: '#f7fafc',
      textSecondary: '#cbd5e0',
      inputBg: '#1f2937',
    },
    light: {
      name: 'Light',
      primary: '#2563eb',
      primaryHover: '#1d4ed8',
      secondary: '#e2e8f0',
      accent: '#718096',
      background: '#f7fafc',
      panelBg: '#ffffff',
      headerBg: '#edf2f7',
      borderColor: '#cbd5e0',
      textPrimary: '#1a202c',
      textSecondary: '#4a5568',
      inputBg: '#f7fafc',
    }
  };

  var THEME_STORAGE_KEY = "swagger-llm-theme";
  var SETTINGS_STORAGE_KEY = "swagger-llm-settings";
  var CHAT_HISTORY_KEY = "swagger-llm-chat-history";

  // ── Theme loading/saving functions ─────────────────────────────────────────
  function loadTheme() {
    try {
      var raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        // Validate theme is a valid key in THEME_DEFINITIONS
        if (parsed.theme && THEME_DEFINITIONS[parsed.theme]) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load theme from localStorage:', e);
    }
    // Return default if invalid or not found
    return { theme: 'dark', customColors: {} };
  }

  function saveTheme(themeData) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themeData));
    } catch (e) {
      // ignore
    }
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveToStorage(state) {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state));
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
  var SET_THEME = "LLM_SET_THEME";
  var SET_CUSTOM_COLOR = "LLM_SET_CUSTOM_COLOR";

  // ── Default state ───────────────────────────────────────────────────────────
  var storedSettings = loadFromStorage();
  var storedTheme = loadTheme();

  // ── Apply theme immediately on DOM ready to prevent flash of wrong theme ───
  document.addEventListener('DOMContentLoaded', function() {
    // Apply the saved/custom theme as soon as DOM is ready
    window.applyLLMTheme(storedTheme.theme, storedTheme.customColors);
  });

  var DEFAULT_STATE = {
    baseUrl: storedSettings.baseUrl || "https://api.openai.com/v1",
    apiKey: storedSettings.apiKey || "",
    modelId: storedSettings.modelId || "gpt-4",
    maxTokens: storedSettings.maxTokens != null ? storedSettings.maxTokens : 4096,
    temperature: storedSettings.temperature != null ? storedSettings.temperature : 0.7,
    provider: storedSettings.provider || "openai",
    connectionStatus: "disconnected", // disconnected | connecting | connected | error
    settingsOpen: false,
    chatHistory: loadChatHistory(),
    lastError: "",
    theme: storedTheme.theme || "dark",
    customColors: storedTheme.customColors || {},
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
      case SET_THEME:
        var newTheme = action.payload;
        // Validate theme
        if (!THEME_DEFINITIONS[newTheme]) {
          console.warn('Invalid theme:', newTheme, 'Using default dark theme');
          newTheme = 'dark';
        }
        var themeDef = THEME_DEFINITIONS[newTheme] || THEME_DEFINITIONS.dark;
        // Merge custom colors with defaults for this theme
        var mergedColors = Object.assign({}, themeDef, state.customColors || {});
        saveTheme({ theme: newTheme, customColors: mergedColors });
        return Object.assign({}, state, { theme: newTheme, customColors: mergedColors });
      case SET_CUSTOM_COLOR:
        var colorKey = action.payload.key;
        var colorValue = action.payload.value;
        var newColors = Object.assign({}, state.customColors || {});
        newColors[colorKey] = colorValue;
        saveTheme({ theme: state.theme, customColors: newColors });
        return Object.assign({}, state, { customColors: newColors });
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
    setTheme: function (value) { return { type: SET_THEME, payload: value }; },
    setCustomColor: function (value) { return { type: SET_CUSTOM_COLOR, payload: value }; },
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
    getTheme: function (state) { return state.get ? state.get("theme") : state.theme; },
    getCustomColors: function (state) { return state.get ? state.get("customColors") : state.customColors; },
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

  // ── Message ID counter for unique timestamps (fixes timestamp collision issue) ─
  var _messageIdCounter = 0;

  // Generate a unique message ID to prevent timestamp collisions
  function generateMessageId() {
    return Date.now() + '_' + (++_messageIdCounter);
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
          chatHistory: loadChatHistory(),
          schemaLoading: false,
          copiedMessageId: null,
          headerHover: {},
        };
        this.handleSend = this.handleSend.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.clearHistory = this.clearHistory.bind(this);
        this.copyToClipboard = this.copyToClipboard.bind(this);
        this.renderTypingIndicator = this.renderTypingIndicator.bind(this);
        this.formatMessageContent = this.formatMessageContent.bind(this);
        this.setHeaderHover = this.setHeaderHover.bind(this);
        this.renderMessage = this.renderMessage.bind(this);
        this._copyTimeoutId = null;
        
        this._fetchAbortController = null;
      
        // Initialize marked.js
        initMarked();
      }

      componentDidMount() {
        this.fetchOpenApiSchema();
      }

      componentWillUnmount() {
        // Abort any pending fetch for OpenAPI schema
        if (this._fetchAbortController) {
          this._fetchAbortController.abort();
          this._fetchAbortController = null;
        }
        if (this._copyTimeoutId) {
          clearTimeout(this._copyTimeoutId);
          this._copyTimeoutId = null;
        }
      }

      fetchOpenApiSchema() {
        var self = this;
        
        // Abort any existing request
        if (this._fetchAbortController) {
          this._fetchAbortController.abort();
        }
        
        self._fetchAbortController = new AbortController();
        self.setState({ schemaLoading: true });
        
        fetch("/openapi.json", { signal: self._fetchAbortController.signal })
          .then(function (res) { return res.json(); })
          .then(function (schema) {
            // Store full schema for use in chat requests
            self._openapiSchema = schema;
            dispatchAction(system, 'setOpenApiSchema', schema);
            
            // Update localStorage with full schema for persistence
            try {
                var storedSettings = loadFromStorage();
                storedSettings.openapiSchema = schema;
                saveToStorage(storedSettings);
            } catch (e) {
                // Ignore storage errors
            }
            
            self.setState({ schemaLoading: false });
          })
          .catch(function (err) {
            if (err.name !== 'AbortError') {
              console.warn('Failed to fetch OpenAPI schema:', err);
              self.setState({ schemaLoading: false });
            }
          });
      }

      addMessage(msg) {
        this.setState(function (prev) {
          var history = prev.chatHistory || [];
          // Use the exact message ID to update instead of timestamp (fixes collision)
          if (history.length > 0 && msg.role === 'assistant' && history[history.length - 1].role === 'assistant' && history[history.length - 1].messageId === msg.messageId) {
            var updated = history.slice(0, -1).concat([msg]);
            saveChatHistory(updated);
            return { chatHistory: updated };
          }
          var updated = history.concat([msg]);
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

      handleCancel() {
        if (this.state.cancelToken) {
          this.state.cancelToken.abort();
        }
      }

      handleSend() {
        if (!this.state.input.trim() || this.state.isTyping) return;

        var self = this;
        var userInput = this.state.input.trim();
        var msgId = generateMessageId(); // Use unique message ID instead of timestamp
        var streamMsgId = generateMessageId();

        // Build API messages from current history + new user message before setState
        var userMsg = { role: 'user', content: userInput, messageId: msgId };
        var currentHistory = self.state.chatHistory || [];
        var apiMessages = currentHistory.concat([userMsg]).map(function (m) {
          return { role: m.role, content: m.content };
        });

        // Add user message to local state
        self.addMessage(userMsg);
        // Also add empty assistant message immediately so it persists in chatHistory
        self.addMessage({ role: 'assistant', content: '', messageId: streamMsgId });
        
        // Store cancelToken on the class, not state (avoid re-renders)
        self._currentCancelToken = new AbortController();
        
        var settings = loadFromStorage();

        var scrollToBottom = function() {
          var el = document.getElementById('llm-chat-messages');
          if (el) el.scrollTop = el.scrollHeight;
        };

        var finalize = function(content, saveContent) {
          // Update the assistant message in chatHistory with final content
          if (saveContent && content && content.trim() && content !== "*(cancelled)*") {
            self.addMessage({ role: 'assistant', content: content, messageId: streamMsgId });
          }
          self._currentCancelToken = null;
          self.setState({ 
            isTyping: false,
          });
          setTimeout(scrollToBottom, 30);
        };

        // Track accumulated content at handleSend scope so cancel/catch can access it
        var accumulated = "";
        
        // Track the messageId of the message being streamed to update the correct message
        var currentStreamMessageId = streamMsgId;

        // Get full OpenAPI schema from localStorage or fetch if not available
        var getOpenApiSchema = function() {
            try {
                var storedSettings = loadFromStorage();
                if (storedSettings.openapiSchema) {
                    return storedSettings.openapiSchema;
                }
            } catch (e) {
                // Ignore errors
            }
            return null;
        };

        var fullSchema = getOpenApiSchema();
        
        fetch("/llm-chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Only include non-empty header values
            "X-LLM-Base-Url": settings.baseUrl || "",
            "X-LLM-Api-Key": settings.apiKey || "",
            "X-LLM-Model-Id": settings.modelId || "",
            "X-LLM-Max-Tokens": (settings.maxTokens != null && settings.maxTokens !== '') ? String(settings.maxTokens) : "",
            "X-LLM-Temperature": (settings.temperature != null && settings.temperature !== '') ? String(settings.temperature) : "",
          },
          body: JSON.stringify({
            messages: apiMessages,
            openapi_schema: fullSchema
          }),
          signal: self._currentCancelToken.signal
        })
          .then(function (res) {
            if (!res.ok) {
              throw new Error("HTTP " + res.status + ": " + res.statusText);
            }
            var reader = res.body.getReader();
            var decoder = new TextDecoder();
            var buffer = "";

            var processChunk = function() {
              return reader.read().then(function (result) {
                if (self._currentCancelToken && self._currentCancelToken.signal.aborted) {
                  finalize(accumulated, true);
                  return;
                }
                if (result.done) {
                  finalize(accumulated || "Sorry, I couldn't get a response.", true);
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
                      finalize("Error: " + chunk.error + (chunk.details ? ": " + chunk.details : ""), false);
                      return;
                    }
                    if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                      accumulated += chunk.choices[0].delta.content;
                      // Update the last assistant message in chatHistory with streaming content
                      self.setState(function (prev) {
                        var history = prev.chatHistory || [];
                        if (history.length > 0 && history[history.length - 1].role === 'assistant' && 
                            history[history.length - 1].messageId === currentStreamMessageId) {
                          var updated = history.slice(0, -1).concat([{
                            role: 'assistant',
                            content: accumulated,
                            messageId: history[history.length - 1].messageId
                          }]);
                          saveChatHistory(updated);
                          return { chatHistory: updated };
                        }
                        return {};
                      });
                      scrollToBottom();
                    }
                  } catch (e) {
                    // skip unparseable chunks
                  }
                }

                return processChunk();
              });
            };

            return processChunk();
          })
          .catch(function (err) {
            if (err.name === 'AbortError') {
              finalize(accumulated, true);
            } else {
              finalize("Error: " + (err.message || "Request failed"), false);
            }
          });

        setTimeout(scrollToBottom, 50);
      }

      setHeaderHover(timestamp, show) {
        var newHover = Object.assign({}, this.state.headerHover);
        if (show) {
          newHover[timestamp] = true;
        } else {
          delete newHover[timestamp];
        }
        this.setState({ headerHover: newHover });
      }

      copyToClipboard(text) {
        if (!text || !navigator.clipboard) return;
        
        navigator.clipboard.writeText(text).then(function () {
          if (this._copyTimeoutId) clearTimeout(this._copyTimeoutId);
          this._copyTimeoutId = setTimeout(function () {
            this._copyTimeoutId = null;
            this.setState({ copiedMessageId: null });
          }.bind(this), 2000);
        }.bind(this)).catch(function (err) {
          console.error('Failed to copy:', err);
        });
      }

      renderTypingIndicator() {
        var React = system.React;
        return React.createElement(
          "div",
          { className: "llm-typing-indicator" },
          React.createElement("span", null, "Assistant is typing"),
          React.createElement("span", { className: "llm-typing-dot", style: { animationDelay: '-0.32s' } }),
          React.createElement("span", { className: "llm-typing-dot", style: { animationDelay: '-0.16s' } }),
          React.createElement("span", { className: "llm-typing-dot" })
        );
      }

      clearHistory() {
        saveChatHistory([]);
        this.setState({ chatHistory: [] });
      }

      renderMessage(msg, idx) {
        var React = system.React;
        var self = this;
        var isUser = msg.role === 'user';
        
        // Check if this is the last assistant message and we're currently typing
        var chatHistory = self.state.chatHistory || [];
        var isStreamingThisMessage = self.state.isTyping && 
          !isUser && 
          idx === chatHistory.length - 1 &&
          msg.role === 'assistant';
        
        return React.createElement(
          "div",
          { key: msg.messageId || msg.timestamp, className: "llm-chat-message-wrapper" },
          React.createElement(
            "div",
            { 
              className: "llm-chat-message " + (isUser ? 'user' : 'assistant'),
              style: { maxWidth: isUser ? "85%" : "90%" }
            },
            !isUser && React.createElement("div", { 
              className: "llm-avatar assistant-avatar",
              title: "AI Assistant"
            }, "🤖"),
            React.createElement(
              "div",
              { 
                className: "llm-chat-message-header",
                onMouseEnter: function() { self.setHeaderHover(msg.messageId || msg.timestamp, true); },
                onMouseLeave: function() { self.setHeaderHover(msg.messageId || msg.timestamp, false); }
              },
              isUser 
                ? React.createElement("span", { className: "llm-user-label" }, "You")
                : React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
                    React.createElement("span", { className: "llm-assistant-label" }, "Assistant"),
                    React.createElement("span", { className: "llm-chat-message-time" },
                      (msg.messageId || msg.timestamp) ? new Date(parseInt((msg.messageId || "").split('_')[0] || msg.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
                    )
                  ),
              React.createElement(
                "button",
                {
                  className: "llm-copy-btn",
                  onClick: function() { self.copyToClipboard(msg.content); },
                  title: "Copy message",
                  style: Object.assign({}, styles.copyMessageBtn, {
                    opacity: (self.state.headerHover[msg.messageId || msg.timestamp] || self.state.copiedMessageId === msg.messageId) && !isStreamingThisMessage ? 1 : 0
                  })
                },
                self.state.copiedMessageId === msg.messageId ? "✅" : "📋"
              )
            ),
            React.createElement(
              "div",
              { className: "llm-chat-message-content" },
              this.formatMessageContent(msg.content, isStreamingThisMessage)
            )
          )
        );
      }

      formatMessageContent(content, isStreaming) {
        var React = system.React;
        
        // If content is empty and we're streaming, show a "streaming..." indicator
        if (!content || !content.trim()) {
          if (isStreaming) {
            return React.createElement("span", { 
              className: "llm-streaming-indicator",
              style: { fontStyle: 'italic', opacity: 0.7, fontSize: '13px', marginTop: '8px' }
            }, "Stream starting...");
          }
          return null;
        }
        
        // Parse Markdown
        var html = parseMarkdown(content);
        
        return React.createElement("div", {
          className: "llm-chat-message-text",
          style: styles.chatMessageContent,
          dangerouslySetInnerHTML: { __html: html }
        });
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
            chatHistory.length === 0
              ? React.createElement(
                  "div",
                  { style: styles.emptyChat },
                  "Ask questions about your API!\n\nExamples:\n• What endpoints are available?\n• How do I use the chat completions endpoint?\n• Generate a curl command for /health"
                )
              : chatHistory.map(this.renderMessage)
            ),
          this.state.isTyping
            ? React.createElement(
                "div",
                { style: { padding: "8px 12px", color: "var(--theme-text-secondary)", fontSize: "12px" } },
                this.renderTypingIndicator()
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
              this.state.isTyping && React.createElement(
                "button",
                {
                  onClick: function() { 
                    if (self._currentCancelToken) self._currentCancelToken.abort(); 
                  },
                  style: Object.assign({}, styles.sendButton, { background: "#dc2626" }),
                  title: "Cancel streaming response"
                },
                "Cancel"
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
        // Initialize with safe defaults from stored settings
        var s = loadFromStorage();
        this.state = {
          baseUrl: s.baseUrl || DEFAULT_STATE.baseUrl,
          apiKey: s.apiKey || DEFAULT_STATE.apiKey,
          modelId: s.modelId || DEFAULT_STATE.modelId,
          maxTokens: s.maxTokens != null && s.maxTokens !== '' ? s.maxTokens : DEFAULT_STATE.maxTokens,
          temperature: s.temperature != null && s.temperature !== '' ? s.temperature : DEFAULT_STATE.temperature,
          provider: s.provider || DEFAULT_STATE.provider,
          theme: DEFAULT_STATE.theme,
          customColors: DEFAULT_STATE.customColors,
          connectionStatus: "disconnected",
          settingsOpen: false,
          lastError: "",
        };
        this.handleSaveSettings = this.handleSaveSettings.bind(this);
        this.handleTestConnection = this.handleTestConnection.bind(this);
        this.toggleOpen = this.toggleOpen.bind(this);
        this.handleProviderChange = this.handleProviderChange.bind(this);
        this.handleBaseUrlChange = this.handleBaseUrlChange.bind(this);
        this.handleApiKeyChange = this.handleApiKeyChange.bind(this);
        this.handleModelIdChange = this.handleModelIdChange.bind(this);
        this.handleMaxTokensChange = this.handleMaxTokensChange.bind(this);
        this.handleTemperatureChange = this.handleTemperatureChange.bind(this);
        this.handleThemeChange = this.handleThemeChange.bind(this);
      }

      componentDidMount() {
        // Reload theme from localStorage to ensure we have the latest values
        var stored = loadTheme();
        // Update state with validated theme from localStorage
        this.setState({ 
          theme: stored.theme || DEFAULT_STATE.theme, 
          customColors: stored.customColors || {} 
        });
        
        // Apply theme using requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(function() {
          window.applyLLMTheme(stored.theme || DEFAULT_STATE.theme, stored.customColors);
        });
      }

      componentDidUpdate(prevProps, prevState) {
        // Apply theme when theme or colors change
        if (prevState.theme !== this.state.theme || prevState.customColors !== this.state.customColors) {
          window.applyLLMTheme(this.state.theme, this.state.customColors);
        }
      }

      handleSaveSettings() {
        var settings = {
          baseUrl: this.state.baseUrl,
          apiKey: this.state.apiKey,
          modelId: this.state.modelId,
          maxTokens: this.state.maxTokens !== '' ? this.state.maxTokens : null,
          temperature: this.state.temperature !== '' ? this.state.temperature : null,
          provider: this.state.provider,
        };
        saveToStorage(settings);
        // Also ensure current theme is persisted to localStorage
        saveTheme({ theme: this.state.theme, customColors: this.state.customColors });
        // Don't change connection status, just save
      }

      handleTestConnection() {
        var self = this;
        var settings = {
          baseUrl: this.state.baseUrl,
          apiKey: this.state.apiKey,
          modelId: this.state.modelId,
          maxTokens: this.state.maxTokens !== '' ? this.state.maxTokens : null,
          temperature: this.state.temperature !== '' ? this.state.temperature : null,
          provider: this.state.provider,
        };
        // Update localStorage with current state values (for test)
        saveToStorage(settings);
        self.setState({ connectionStatus: "connecting", lastError: "" });
        dispatchAction(system, 'setConnectionStatus', "connecting");

        // Route through backend proxy to avoid CORS (new /llm/models endpoint)
        fetch("/llm/models", {
          method: 'GET',
          headers: {
            "Content-Type": "application/json",
            // Only include non-empty header values
            "X-LLM-Base-Url": settings.baseUrl || "",
            "X-LLM-Api-Key": settings.apiKey || "",
            "X-LLM-Model-Id": settings.modelId || "",
          }
        })
          .then(function (res) {
            if (!res.ok) {
              return res.json().catch(function() { 
                throw new Error('HTTP ' + res.status + ': ' + res.statusText); 
              });
            }
            return res.json();
          })
          .then(function (data) {
            // Check if response has error field
            if (data && data.error) {
              throw new Error(data.details || data.error);
            }
            self.setState({ connectionStatus: "connected" });
            dispatchAction(system, 'setConnectionStatus', "connected");
          })
          .catch(function (err) {
            var errorMsg = err.message || "Connection failed";
            self.setState({ connectionStatus: "error", lastError: errorMsg });
            dispatchAction(system, 'setConnectionStatus', "error");
          });
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

      handleThemeChange(e) {
        var value = e.target.value;
        this.setState({ theme: value });
        dispatchAction(system, 'setTheme', value);
      }

      handleColorChange(colorKey, e) {
        var value = e.target.value;
        this.setState(function (prev) {
          var newColors = Object.assign({}, prev.customColors || {});
          newColors[colorKey] = value;
          return { customColors: newColors };
        });
        dispatchAction(system, 'setCustomColor', { key: colorKey, value: value });
      }

      render() {
        var self = this;
        var s = this.state;
        var React = system.React;

        var statusEmoji = STATUS_EMOJI[s.connectionStatus] || "⚪";
        var provider = LLM_PROVIDERS[s.provider] || LLM_PROVIDERS.custom;

        // Input styling (theme-aware)
        var inputStyle = {
          background: "var(--theme-input-bg)",
          border: "1px solid var(--theme-border-color)",
          borderRadius: "4px",
          color: "var(--theme-text-primary)",
          padding: "6px 10px",
          width: "100%",
          boxSizing: "border-box",
          fontSize: "13px",
        };

        var labelStyle = { color: "var(--theme-text-secondary)", fontSize: "12px", marginBottom: "4px", display: "block" };
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
              onChange: this.handleProviderChange,
              style: inputStyle
            },
            providerOptions
          )
        );

        // Provider badge (no inline color overrides — CSS classes handle colors)
        var providerBadge = React.createElement(
          "span",
          { className: "llm-provider-badge llm-provider-" + (s.provider === 'custom' ? 'openai' : s.provider), style: { fontSize: "10px", padding: "2px 8px", borderRadius: "10px", marginLeft: "8px" } },
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
              onChange: this.handleBaseUrlChange,
            }),
            provider.name !== 'Custom' && React.createElement(
              "span",
              { style: { marginLeft: "8px", fontSize: "10px", color: "var(--theme-text-secondary)" } },
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
              onChange: this.handleApiKeyChange,
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
              onChange: this.handleModelIdChange,
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
              onChange: this.handleMaxTokensChange,
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
              onChange: this.handleTemperatureChange,
            })
          )
        );

        // Theme settings fields
        var themeConfig = React.createElement(
          "div",
          { style: fieldStyle },
          React.createElement("label", { style: labelStyle }, "Theme"),
          React.createElement(
            "select",
            {
              value: s.theme,
              onChange: this.handleThemeChange,
              style: inputStyle
            },
            Object.keys(THEME_DEFINITIONS).map(function (key) {
              return React.createElement(
                "option",
                { key: key, value: key },
                THEME_DEFINITIONS[key].name
              );
            })
          )
        );

        // Color picker fields
        var colorFields = React.createElement(
          "div",
          { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" } },
          React.createElement(
            "div",
            { style: fieldStyle },
            React.createElement("label", { style: labelStyle }, "Primary"),
            React.createElement("input", {
              type: "color",
              value: s.customColors.primary || THEME_DEFINITIONS[s.theme].primary,
              onChange: this.handleColorChange.bind(this, 'primary'),
              style: { width: "60px", height: "32px", border: "none", cursor: "pointer" }
            })
          ),
          React.createElement(
            "div",
            { style: fieldStyle },
            React.createElement("label", { style: labelStyle }, "Background"),
            React.createElement("input", {
              type: "color",
              value: s.customColors.background || THEME_DEFINITIONS[s.theme].background,
              onChange: this.handleColorChange.bind(this, 'background'),
              style: { width: "60px", height: "32px", border: "none", cursor: "pointer" }
            })
          ),
          React.createElement(
            "div",
            { style: fieldStyle },
            React.createElement("label", { style: labelStyle }, "Text Primary"),
            React.createElement("input", {
              type: "color",
              value: s.customColors.textPrimary || THEME_DEFINITIONS[s.theme].textPrimary,
              onChange: this.handleColorChange.bind(this, 'textPrimary'),
              style: { width: "60px", height: "32px", border: "none", cursor: "pointer" }
            })
          )
        );

        var saveButton = React.createElement(
          "button",
          {
            onClick: this.handleSaveSettings,
            style: {
              background: "var(--theme-primary)",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "8px 18px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: "600",
            },
          },
          "Save Configuration"
        );

        var testButton = React.createElement(
          "button",
          {
            onClick: this.handleTestConnection,
            style: {
              background: "var(--theme-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "8px 18px",
              cursor: "pointer",
              fontSize: "13px",
              marginLeft: "8px",
            },
          },
          "Test Connection"
        );

        var statusBadge = React.createElement(
          "span",
          {
            style: {
              marginLeft: "12px",
              fontSize: "13px",
              color: s.connectionStatus === "error" ? "#f87171" : "var(--theme-text-secondary)",
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

        // When used as a tab, render the full panel without collapsible header
        var bodyContent = React.createElement(
          "div",
          { style: { padding: "16px", background: "var(--theme-panel-bg)" } },
          React.createElement(
            "div",
            { style: { marginBottom: "24px", paddingBottom: "20px", borderBottom: "1px solid var(--theme-border-color)" } },
            React.createElement("h3", { style: { color: "var(--theme-text-primary)", fontSize: "14px", fontWeight: "600", marginBottom: "12px" } }, "LLM Configuration"),
            fields
          ),
          React.createElement(
            "div",
            { style: { marginBottom: "24px", paddingBottom: "20px", borderBottom: "1px solid var(--theme-border-color)" } },
            React.createElement("h3", { style: { color: "var(--theme-text-primary)", fontSize: "14px", fontWeight: "600", marginBottom: "12px" } }, "Theme Settings"),
            React.createElement(
              "div",
              { style: { display: "grid", gridTemplateColumns: "1fr 3fr", gap: "12px" } },
              themeConfig,
              React.createElement(
                "div",
                null,
                colorFields
              )
            )
          ),
          React.createElement(
            "div",
            { style: { display: "flex", alignItems: "center" } },
            saveButton,
            testButton,
            React.createElement("div", { style: { flex: 1 } }),
            statusBadge
          )
        );

        return React.createElement(
          "div",
          {
            id: "llm-settings-panel",
            style: {
              fontFamily: "'Inter', 'Segoe UI', sans-serif",
              minHeight: "400px",
            },
          },
          bodyContent
        );
      }
    };
  }

  // ── CSS styles object (uses CSS variables for theme support) ────────────────
  var styles = {
    chatContainer: {
      display: "flex",
      flexDirection: "column",
      minHeight: "400px",
      maxHeight: "65vh",
      height: "calc(100vh - 200px)",
    },
    chatMessages: {
      flex: 1,
      overflowY: "auto",
      padding: "12px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      scrollBehavior: "smooth",
    },
    chatMessage: {
      display: "flex",
      flexDirection: "column",
      padding: "10px 14px",
      borderRadius: "12px",
      maxWidth: "85%",
    },
    chatMessageHeader: {
      fontSize: "10px",
      marginBottom: "6px",
      opacity: 0.8,
    },
    chatMessageContent: {
      fontSize: "15px",
      lineHeight: "1.6",
    },
    copyMessageBtn: {
      background: "transparent",
      border: "none",
      color: "var(--theme-text-secondary)",
      fontSize: "14px",
      cursor: "pointer",
      padding: "2px 6px",
      borderRadius: "4px",
      opacity: 0,
      transition: "opacity 0.2s ease, color 0.2s ease",
    },
    chatInputArea: {
      borderTop: "1px solid var(--theme-border-color)",
      padding: "12px",
    },
    chatInput: {
      width: "100%",
      background: "var(--theme-input-bg)",
      border: "1px solid var(--theme-border-color)",
      borderRadius: "4px",
      color: "var(--theme-text-primary)",
      padding: "8px 10px",
      fontSize: "14px",
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
      background: "var(--theme-accent)",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      padding: "4px 10px",
      cursor: "pointer",
      fontSize: "10px",
    },
    sendButton: {
      background: "var(--theme-primary)",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      padding: "6px 16px",
      cursor: "pointer",
      fontSize: "12px",
    },
    emptyChat: {
      textAlign: "center",
      color: "var(--theme-text-secondary)",
      padding: "40px 20px",
      fontSize: "15px",
      whiteSpace: "pre-line",
    },
  };

  // ── CSS injection helper with guard to prevent duplicates ─────────────────
  function injectStyles(id, css) {
    if (typeof document === 'undefined') return;
    
    // Check for existing style element
    var existing = document.getElementById(id);
    if (existing) {
      // Update content if different
      if (existing.textContent !== css) {
        existing.textContent = css;
      }
      return;
    }
    
    var styleEl = document.createElement('style');
    styleEl.id = id;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // ── CSS styles for chat bubbles, avatars, and animations (theme-aware) ─────
  var chatStyles = [
    // Chat message wrapper styles
    '.llm-chat-message-wrapper { display: flex; width: 100%; margin-bottom: 8px; }',

    // Message bubble styles
    '.llm-chat-message { padding: 10px 14px; border-radius: 12px; max-width: 85%; position: relative; }',
    '.llm-chat-message.user { align-self: flex-end; background: var(--theme-primary); color: white; }',
    '.llm-chat-message.assistant { align-self: flex-start; background: var(--theme-secondary); color: var(--theme-text-primary); }',

    // Avatar styles
    '.llm-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; margin-right: 8px; flex-shrink: 0; }',
    '.assistant-avatar { background: linear-gradient(135deg, #6366f1, #8b5cf6); }',
    '.llm-chat-message.assistant .llm-avatar { margin-right: 8px; }',

    // Message header (user/assistant label + time)
    '.llm-chat-message-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 11px; opacity: 0.9; }',
    '.llm-user-label { font-weight: 600; color: var(--theme-text-primary); }',
    '.llm-assistant-label { font-weight: 600; color: #8b5cf6; }',
    '.llm-chat-message-time { opacity: 0.7; font-size: 10px; }',

    // Copy button on messages
    '.llm-copy-btn { background: transparent; border: none; color: var(--theme-text-secondary); font-size: 14px; cursor: pointer; padding: 2px 6px; border-radius: 4px; transition: all 0.2s ease; margin-left: 8px; }',
    '.llm-copy-btn:hover { background: var(--theme-accent); color: white; transform: scale(1.1); }',

    // Chat message text
    '.llm-chat-message-text { font-size: 15px; line-height: 1.6; word-wrap: break-word; }',
    '.llm-chat-message-text p { margin: 8px 0; }',
    '.llm-chat-message-text p:first-child { margin-top: 4px; }',
    '.llm-chat-message-text p:last-child { margin-bottom: 4px; }',

    // Streaming placeholder indicator
    '.llm-streaming-indicator { color: var(--theme-accent); font-style: italic; opacity: 0.7; font-size: 13px; margin-top: 8px; }',

    // Markdown content in messages
    '.llm-chat-message-text strong { color: var(--theme-text-primary); }',
    '.llm-chat-message-text em { font-style: italic; }',
    '.llm-chat-message-text ul { margin: 8px 0; padding-left: 24px; }',
    '.llm-chat-message-text ol { margin: 8px 0; padding-left: 24px; }',
    '.llm-chat-message-text li { margin: 4px 0; }',
    '.llm-chat-message-text blockquote { border-left: 3px solid var(--theme-accent); margin: 8px 0; padding-left: 12px; opacity: 0.9; }',
    '.llm-chat-message-text a { color: #60a5fa; text-decoration: none; }',
    '.llm-chat-message-text a:hover { text-decoration: underline; }',

    // Code blocks in messages
    '.llm-chat-message-text pre { background: var(--theme-input-bg); border-radius: 8px; padding: 12px; overflow-x: auto; margin: 10px 0; font-family: "Consolas", "Monaco", monospace; font-size: 14px; position: relative; }',
    '.llm-chat-message-text code { font-family: "Consolas", "Monaco", monospace; background: rgba(0,0,0,0.15); padding: 2px 6px; border-radius: 4px; font-size: 13px; }',
    '.llm-chat-message-text pre code { background: transparent; padding: 0; }',

    // Code block header with copy button
    '.code-block-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--theme-border-color); }',
    '.code-block-label { color: var(--theme-text-secondary); font-size: 12px; font-weight: 600; }',
    '.code-block-copy { background: var(--theme-secondary); border: none; color: var(--theme-text-primary); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; transition: all 0.2s; }',
    '.code-block-copy:hover { background: var(--theme-accent); color: white; }',
    '.code-block-copy.copied { background: #10b981 !important; color: white; }',

    // Scrollbar styling
    '#llm-chat-messages::-webkit-scrollbar { width: 8px; }',
    '#llm-chat-messages::-webkit-scrollbar-track { background: var(--theme-panel-bg); border-radius: 4px; }',
    '#llm-chat-messages::-webkit-scrollbar-thumb { background: var(--theme-secondary); border-radius: 4px; }',
    '#llm-chat-messages::-webkit-scrollbar-thumb:hover { background: var(--theme-accent); }',

    // Typing indicator animation
    '@keyframes typing { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }',
    '.llm-typing-indicator { display: inline-flex; align-items: center; gap: 4px; padding: 8px 12px; background: var(--theme-secondary); border-radius: 18px; font-size: 14px; margin-bottom: 8px; }',
    '.llm-typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--theme-text-secondary); animation: typing 1.4s infinite ease-in-out both; }',
    '.llm-typing-dot:nth-child(1) { animation-delay: -0.32s; }',
    '.llm-typing-dot:nth-child(2) { animation-delay: -0.16s; }',

    // Mobile responsive styles
    '@media (max-width: 768px) {',
    '  .llm-chat-message-wrapper { width: 100%; padding: 0 8px; }',
    '  .llm-chat-message { max-width: 92%; padding: 10px 12px; }',
    '  .llm-avatar { width: 28px; height: 28px; font-size: 16px; }',
    '  .llm-chat-message-text { font-size: 15px; }',
    '  .llm-typing-indicator { font-size: 14px; padding: 10px 14px; }',
    '}',

    // Chat container responsive
    '@media (max-width: 768px) {',
    '  .llm-chat-container { height: calc(100vh - 160px) !important; max-height: none !important; }',
    '  .llm-chat-messages { padding: 8px; gap: 10px; }',
    '}',
  ].join('\n');
  
  // Inject chat styles into document
  injectStyles('swagger-llm-chat-styles', chatStyles);

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

  // ── Theme injection function ────────────────────────────────────────────────
  window.applyLLMTheme = function (themeName, customColors) {
    // Validate theme name
    var validatedTheme = THEME_DEFINITIONS[themeName] ? themeName : 'dark';
    var themeDef = THEME_DEFINITIONS[validatedTheme];

    // Merge custom colors with theme defaults
    var finalColors = Object.assign({}, themeDef, customColors);

    // Build CSS variables string
    var cssVars = [
      '--theme-primary: ' + finalColors.primary,
      '--theme-primary-hover: ' + (finalColors.primaryHover || finalColors.primary),
      '--theme-secondary: ' + finalColors.secondary,
      '--theme-accent: ' + finalColors.accent,
      '--theme-background: ' + finalColors.background,
      '--theme-panel-bg: ' + (finalColors.panelBg || finalColors.secondary),
      '--theme-header-bg: ' + (finalColors.headerBg || finalColors.background),
      '--theme-border-color: ' + (finalColors.borderColor || finalColors.secondary),
      '--theme-text-primary: ' + finalColors.textPrimary,
      '--theme-text-secondary: ' + (finalColors.textSecondary || '#6b7280'),
      '--theme-input-bg: ' + (finalColors.inputBg || finalColors.secondary),
      '--theme-provider-openai: #10a37f',
      '--theme-provider-anthropic: #d97757',
      '--theme-provider-ollama: #2b90d8',
      '--theme-provider-vllm: #facc15',
      '--theme-provider-azure: #0078d4',
    ].join('; ');

    // Update existing theme style element or create new one using helper
    var css = ':root { ' + cssVars + ' }';
    var themeStyle = document.getElementById('swagger-llm-theme-styles');
    
    if (themeStyle) {
      // Only update if content is different to avoid unnecessary reflows
      if (themeStyle.textContent !== css) {
        themeStyle.textContent = css;
      }
    } else {
      themeStyle = document.createElement('style');
      themeStyle.id = 'swagger-llm-theme-styles';
      themeStyle.textContent = css;
      document.head.appendChild(themeStyle);
    }
  };
})();