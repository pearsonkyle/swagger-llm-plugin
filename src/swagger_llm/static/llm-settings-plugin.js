// LLM Settings Swagger UI Plugin
// Adds statePlugins.llmSettings and components.LLMSettingsPanel

(function () {
  "use strict";

  // ── System Prompt Preset Configuration (load from JSON) ───────────────────
  var SYSTEM_PROMPT_CONFIG = null;
  
  function loadSystemPromptConfig() {
    if (SYSTEM_PROMPT_CONFIG) return SYSTEM_PROMPT_CONFIG;
    
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/swagger-llm-static/system-prompt-config.json', true);
      xhr.timeout = 3000;
      xhr.onload = function() {
        if (xhr.status === 200) {
          try {
            SYSTEM_PROMPT_CONFIG = JSON.parse(xhr.responseText);
            // Config loaded successfully
          } catch (e) {
            console.error('Failed to parse system-prompt-config.json:', e);
          }
        }
      };
      xhr.send();
    } catch (e) {
      console.error('Failed to load system-prompt-config.json:', e);
    }
    
    // Return default if config fails to load
    return {
      presets: {},
      defaultPreset: 'api_assistant'
    };
  }

  // ── Get system prompt for a preset ────────────────────────────────────────
  function getSystemPromptForPreset(presetName, openapiSchema) {
    var config = loadSystemPromptConfig();
    var preset = (config.presets || {})[presetName];
    
    if (!preset) {
      // Fallback to API Assistant preset
      var defaultConfig = config.presets || {};
      if (defaultConfig.api_assistant) {
        preset = defaultConfig.api_assistant;
      } else {
        return buildDefaultSystemPrompt(openapiSchema);
      }
    }
    
    var prompt = preset.prompt || '';
    
    // Replace {openapi_context} with actual schema
    if (prompt.includes('{openapi_context}') && openapiSchema) {
      var context = buildOpenApiContext(openapiSchema);
      prompt = prompt.replace('{openapi_context}', '\n\n' + context + '\n');
    }
    
    return prompt;
  }

  // ── Default system prompt builder (fallback) ──────────────────────────────
  function buildDefaultSystemPrompt(schema) {
    var lines = [];
    lines.push('You are a helpful API assistant. The user is looking at an API documentation page for an OpenAPI-compliant REST API.');
    
    if (schema) {
      lines.push(buildOpenApiContext(schema));
    }
    
    return lines.join('\n\n');
  }

  // ── LLM Provider configurations ─────────────────────────────────────────────
  var LLM_PROVIDERS = {
    ollama: { name: 'Ollama', url: 'http://localhost:11434/v1' },
    lmstudio: { name: 'LM Studio', url: 'http://localhost:1234/v1' },
    vllm: { name: 'vLLM', url: 'http://localhost:8000/v1' },
    custom: { name: 'Custom', url: '' }
  };

  // ── Build OpenAPI context from schema (for system prompt) ──────────────────
  function buildOpenApiContext(schema) {
    if (!schema || typeof schema !== 'object') return '';
    
    var lines = [];
    var info = schema.info || {};
    lines.push('# API Information');
    lines.push('## ' + (info.title || 'Untitled API'));
    lines.push('Version: ' + (info.version || 'N/A'));
    
    var description = info.description;
    if (description) {
      lines.push('');
      lines.push('### Description');
      lines.push(description);
    }
    
    var servers = schema.servers || [];
    if (servers && servers.length > 0) {
      lines.push('');
      lines.push('### Base URLs');
      servers.forEach(function(server) {
        var url = server.url || '';
        var desc = server.description || '';
        if (desc) lines.push('- ' + url + ' (' + desc + ')');
        else lines.push('- ' + url);
      });
    }
    
    var paths = schema.paths || {};
    if (paths && Object.keys(paths).length > 0) {
      lines.push('');
      lines.push('# API Endpoints');
      
      Object.keys(paths).forEach(function(path) {
        var pathItem = paths[path];
        if (typeof pathItem !== 'object') return;
        
        lines.push('');
        lines.push('## `' + path + '`');
        
        ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].forEach(function(method) {
          if (!pathItem[method] || typeof pathItem[method] !== 'object') return;
          
          var operation = pathItem[method];
          var verb = method.toUpperCase();
          var summary = operation.summary || '';
          var desc = operation.description || '';
          
          lines.push('### ' + verb);
          if (summary) {
            lines.push('**Summary:** ' + summary);
          }
          if (desc) {
            lines.push('**Description:** ' + desc);
          }
          
          var tags = operation.tags || [];
          if (tags.length > 0) {
            lines.push('**Tags:** ' + tags.join(', '));
          }
          
          var params = operation.parameters || [];
          if (params && params.length > 0) {
            lines.push('');
            lines.push('**Parameters:**');
            params.forEach(function(param) {
              if (typeof param !== 'object') return;
              var name = param.name || 'unknown';
              var inLoc = param.in || 'query';
              var required = param.required ? '[required]' : '[optional]';
              var pDesc = param.description || '';
              lines.push('- `' + name + '` (' + inLoc + ', ' + required + ') - ' + pDesc);
            });
          }
          
          var requestBody = operation.requestBody;
          if (requestBody && typeof requestBody === 'object') {
            var content = requestBody.content || {};
            if (Object.keys(content).length > 0) {
              lines.push('');
              lines.push('**Request Body:**');
              Object.keys(content).forEach(function(contentType) {
                var mediaType = content[contentType];
                if (typeof mediaType !== 'object') return;
                var schemaDef = mediaType.schema || {};
                if (schemaDef && typeof schemaDef === 'object') {
                  lines.push('- Content-Type: `' + contentType + '`');
                  if (schemaDef.type === 'object') {
                    var props = schemaDef.properties || {};
                    var propNames = Object.keys(props).slice(0, 5);
                    lines.push('- Properties: ' + propNames.join(', ') + (Object.keys(props).length > 5 ? '...' : ''));
                  }
                }
              });
            }
          }
          
          var responses = operation.responses || {};
          if (responses && Object.keys(responses).length > 0) {
            lines.push('');
            lines.push('**Responses:**');
            Object.keys(responses).sort().forEach(function(statusCode) {
              var response = responses[statusCode];
              if (typeof response !== 'object') return;
              var resDesc = response.description || 'No description';
              lines.push('- `' + statusCode + '`: ' + resDesc);
            });
          }
        });
      });
    }
    
    var components = schema.components || {};
    if (components) {
      var schemas = components.schemas || {};
      if (schemas && Object.keys(schemas).length > 0) {
        lines.push('');
        lines.push('# Data Models (Schemas)');
        
        Object.keys(schemas).slice(0, 20).forEach(function(schemaName) {
          var schemaDef = schemas[schemaName];
          if (typeof schemaDef !== 'object') return;
          
          lines.push('');
          lines.push('## `' + schemaName + '`');
          
          var desc = schemaDef.description || '';
          if (desc) lines.push('*' + desc + '*');
          
          var props = schemaDef.properties || {};
          if (props && Object.keys(props).length > 0) {
            lines.push('');
            lines.push('**Properties:**');
            Object.keys(props).slice(0, 10).forEach(function(propName) {
              var propDef = props[propName];
              if (typeof propDef !== 'object') return;
              var ptype = propDef.type || 'any';
              var preq = propDef.required ? '[required]' : '[optional]';
              var pdesc = propDef.description || '';
              lines.push('- `' + propName + '` (' + ptype + ', ' + preq + '): ' + pdesc);
            });
          }
        });
      }
    }
    
    return lines.join('\n');
  }

  // ── Build API request tool definition for LLM tool calling ─────────────────
  function buildApiRequestTool(schema) {
    var endpoints = [];
    var methodsEnum = new Set();
    var paths = schema.paths || {};
    
    Object.keys(paths).forEach(function(path) {
      var pathItem = paths[path];
      if (typeof pathItem !== 'object') return;
      
      ['get', 'post'].forEach(function(method) {
        if (!pathItem[method] || typeof pathItem[method] !== 'object') return;
        
        var op = pathItem[method];
        var summary = op.summary || '';
        var desc = method.toUpperCase() + ' ' + path;
        if (summary) {
          desc += ' — ' + summary;
        }
        endpoints.push(desc);
        methodsEnum.add(method.toUpperCase());
      });
    });
    
    if (methodsEnum.size === 0) {
      methodsEnum = new Set(['GET', 'POST']);
    }
    
    var endpointList = endpoints.length > 0 
      ? '\n' + endpoints.map(function(e) { return '- ' + e; }).join('\n')
      : 'No endpoints found.';
    
    return {
      type: 'function',
      function: {
        name: 'api_request',
        description: (
          'Execute an HTTP request against the API. ' +
          'Available endpoints:' + endpointList
        ),
        parameters: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              enum: Array.from(methodsEnum).sort(),
              description: 'HTTP method'
            },
            path: {
              type: 'string',
              description: 'API endpoint path, e.g. /users/{id}'
            },
            query_params: {
              type: 'object',
              description: 'Query string parameters as key-value pairs',
              additionalProperties: true
            },
            path_params: {
              type: 'object',
              description: 'Path parameters to substitute in the URL template',
              additionalProperties: true
            },
            body: {
              type: 'object',
              description: 'JSON request body (for POST requests)',
              additionalProperties: true
            }
          },
          required: ['method', 'path']
        }
      }
    };
  }

  // ── Markdown parser initialization (marked.js) ────────────────────────────
  var marked = null;
  function initMarked() {
    if (marked) return marked;
    
    if (typeof window.marked !== 'undefined') {
      marked = window.marked;
      return marked;
    }
    
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked@9/marked.min.js';
    script.async = true;
    document.head.appendChild(script);
    
    var promise = new Promise(function(resolve, reject) {
      var timedOut = false;
      var timeout = setTimeout(function() {
        timedOut = true;
        reject(new Error('marked.js failed to load within 10 seconds'));
      }, 10000);

      var checkLoaded = function() {
        if (timedOut) return;
        if (window.marked) {
          clearTimeout(timeout);
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

    try {
      if (marked) {
        var html = marked.parse(text);
        if (typeof DOMPurify !== 'undefined') {
          return DOMPurify.sanitize(html);
        }
        return html;
      }
    } catch (e) {
      console.error('Markdown parsing error:', e);
    }

    // Fallback: plain text with line breaks, sanitized
    var escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.replace(/\n/g, '<br>');
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
  var TOOL_SETTINGS_KEY = "swagger-llm-tool-settings";

  // ── Theme loading/saving functions ─────────────────────────────────────────
  function loadTheme() {
    try {
      var raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.theme && THEME_DEFINITIONS[parsed.theme]) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load theme from localStorage:', e);
    }
    // Default to light theme
    return { theme: 'light', customColors: {} };
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
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-20)));
    } catch (e) {
      // ignore
    }
  }

  function loadToolSettings() {
    try {
      var raw = localStorage.getItem(TOOL_SETTINGS_KEY);
      return raw ? JSON.parse(raw) : { enableTools: false, autoExecute: false, apiKey: '' };
    } catch (e) {
      return { enableTools: false, autoExecute: false, apiKey: '' };
    }
  }

  function saveToolSettings(settings) {
    try {
      localStorage.setItem(TOOL_SETTINGS_KEY, JSON.stringify(settings));
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
  var SET_SYSTEM_PROMPT_PRESET = "LLM_SET_SYSTEM_PROMPT_PRESET";
  var SET_CUSTOM_SYSTEM_PROMPT = "LLM_SET_CUSTOM_SYSTEM_PROMPT";

  // ── Default state ───────────────────────────────────────────────────────────
  var storedSettings = loadFromStorage();
  var storedTheme = loadTheme();

  document.addEventListener('DOMContentLoaded', function() {
    window.applyLLMTheme(storedTheme.theme, storedTheme.customColors);
  });

  var DEFAULT_STATE = {
    baseUrl: storedSettings.baseUrl || "http://localhost:11434/v1",
    apiKey: storedSettings.apiKey || "",
    modelId: storedSettings.modelId || "llama3",
    maxTokens: storedSettings.maxTokens != null ? storedSettings.maxTokens : 4096,
    temperature: storedSettings.temperature != null ? storedSettings.temperature : 0.7,
    provider: storedSettings.provider || "ollama",
    connectionStatus: "disconnected",
    settingsOpen: false,
    chatHistory: loadChatHistory(),
    lastError: "",
    theme: storedTheme.theme || "light",
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
        var existingHistory = state.chatHistory;
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
        if (!THEME_DEFINITIONS[newTheme]) {
          console.warn('Invalid theme:', newTheme, 'Using default dark theme');
          newTheme = 'dark';
        }
        var themeDef = THEME_DEFINITIONS[newTheme] || THEME_DEFINITIONS.dark;
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
    getBaseUrl: function (state) { return state.baseUrl; },
    getApiKey: function (state) { return state.apiKey; },
    getModelId: function (state) { return state.modelId; },
    getMaxTokens: function (state) { return state.maxTokens; },
    getTemperature: function (state) { return state.temperature; },
    getConnectionStatus: function (state) { return state.connectionStatus; },
    getProvider: function (state) { return state.provider; },
    getSettingsOpen: function (state) { return state.settingsOpen; },
    getChatHistory: function (state) { return state.chatHistory || []; },
    getOpenApiSchema: function (state) { return state.openapiSchema; },
    getLastError: function (state) { return state.lastError; },
    getTheme: function (state) { return state.theme; },
    getCustomColors: function (state) { return state.customColors; },
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
    var className = 'llm-provider-' + providerKey;
    return React.createElement(
      "span",
      { className: "llm-provider-badge " + className },
      provider.name
    );
  }

  // ── Message ID counter for unique timestamps ─
  var _messageIdCounter = 0;

  function generateMessageId() {
    return Date.now() + '_' + (++_messageIdCounter);
  }

    // ── System Prompt Preset Selector Component (for Settings panel) ───────────
  function createSystemPromptPresetSelector(React) {
    return function SystemPromptPresetSelector(props) {
      var config = loadSystemPromptConfig();
      var presets = config.presets || {};
      var presetKeys = Object.keys(presets);
      var selectedValue = props.value || 'api_assistant';
      var isCustom = selectedValue === 'custom';

      // Resolve the prompt text to display
      var displayText = '';
      if (isCustom) {
        displayText = props.customPrompt || '';
      } else {
        var preset = presets[selectedValue];
        if (preset) {
          displayText = preset.prompt || '';
        } else {
          displayText = buildDefaultSystemPrompt(null);
        }
      }

      // Description for the selected preset
      var description = '';
      if (!isCustom && presets[selectedValue]) {
        description = presets[selectedValue].description || '';
      }

      var textareaStyle = Object.assign({}, props.inputStyle, {
        resize: "vertical",
        minHeight: "120px",
        marginTop: "8px",
        fontFamily: "'Consolas', 'Monaco', monospace",
        fontSize: "12px",
        lineHeight: "1.5",
        whiteSpace: "pre-wrap",
      });

      return React.createElement(
        "div",
        { style: { marginBottom: "12px" } },
        React.createElement("label", { style: props.labelStyle }, "System Prompt Preset"),
        React.createElement(
          "select",
          {
            value: selectedValue,
            onChange: function(e) {
              props.onChange(e.target.value);
              var stored = loadFromStorage();
              stored.systemPromptPreset = e.target.value;
              saveToStorage(stored);
            },
            style: props.inputStyle
          },
          presetKeys.length > 0 ? presetKeys.map(function(key) {
            return React.createElement("option", { key: key, value: key }, presets[key].name);
          }) : React.createElement("option", { value: "api_assistant" }, "API Assistant"),
          React.createElement("option", { value: "custom" }, "Custom...")
        ),
        description && React.createElement("div", {
          style: { color: "var(--theme-text-secondary)", fontSize: "11px", marginTop: "4px", fontStyle: "italic" }
        }, description),
        React.createElement("textarea", {
          value: displayText,
          readOnly: !isCustom,
          onChange: isCustom ? function(e) {
            props.onCustomChange(e.target.value);
            var stored = loadFromStorage();
            stored.customSystemPrompt = e.target.value;
            saveToStorage(stored);
          } : undefined,
          style: Object.assign({}, textareaStyle, !isCustom ? { opacity: 0.8, cursor: "default" } : {}),
          placeholder: isCustom ? "Enter custom system prompt..." : ""
        }),
        !isCustom && React.createElement("div", {
          style: { color: "var(--theme-text-secondary)", fontSize: "10px", marginTop: "4px" }
        }, "{openapi_context} is replaced with your API schema at send time. Select \"Custom...\" to edit.")
      );
    };
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
          pendingToolCall: null,
          editMethod: 'GET',
          editPath: '',
          editQueryParams: '{}',
          editPathParams: '{}',
          editBody: '{}',
          toolCallResponse: null,
          toolRetryCount: 0,
          // System prompt preset state
          selectedPreset: loadFromStorage().systemPromptPreset || 'api_assistant',
          customSystemPrompt: loadFromStorage().customSystemPrompt || '',
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
        this.handleExecuteToolCall = this.handleExecuteToolCall.bind(this);
        this.sendToolResult = this.sendToolResult.bind(this);
        this.renderToolCallPanel = this.renderToolCallPanel.bind(this);
        this._copyTimeoutId = null;
        this._fetchAbortController = null;
        this._lastToolCallAssistantMsg = null;

        initMarked();
      }

      componentDidMount() {
        this.fetchOpenApiSchema();
      }

      componentWillUnmount() {
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
        
        if (this._fetchAbortController) {
          this._fetchAbortController.abort();
        }
        
        self._fetchAbortController = new AbortController();
        self.setState({ schemaLoading: true });
        
        fetch("/openapi.json", { signal: self._fetchAbortController.signal })
          .then(function (res) { return res.json(); })
          .then(function (schema) {
            self._openapiSchema = schema;
            dispatchAction(system, 'setOpenApiSchema', schema);
            
            try {
                var storedSettings = loadFromStorage();
                storedSettings.openapiSchema = schema;
                saveToStorage(storedSettings);
            } catch (e) {
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
        if (this._currentCancelToken) {
          this._currentCancelToken.abort();
        }
      }

      handleExecuteToolCall() {
        var self = this;
        var s = this.state;

        var executedArgs = {
          method: s.editMethod || 'GET',
          path: s.editPath || '',
        };
        try { executedArgs.query_params = JSON.parse(s.editQueryParams || '{}'); } catch (e) { executedArgs.query_params = {}; }
        try { executedArgs.path_params = JSON.parse(s.editPathParams || '{}'); } catch (e) { executedArgs.path_params = {}; }
        if (s.editMethod === 'POST') {
          try { executedArgs.body = JSON.parse(s.editBody || '{}'); } catch (e) { executedArgs.body = {}; }
        }

        if (self._pendingToolCallMsg) {
          var toolMsg = Object.assign({}, self._pendingToolCallMsg, {
            _displayContent: 'Tool call: api_request(' + executedArgs.method + ' ' + executedArgs.path + ')',
            _toolArgs: executedArgs
          });
          if (toolMsg.tool_calls && toolMsg.tool_calls.length > 0) {
            toolMsg.tool_calls = toolMsg.tool_calls.map(function(tc) {
              return Object.assign({}, tc, {
                function: Object.assign({}, tc.function, {
                  arguments: JSON.stringify(executedArgs)
                })
              });
            });
          }
          self.addMessage(toolMsg);
          self._pendingToolCallMsg = null;
        }

        var url = s.editPath;
        try {
          var pathParams = JSON.parse(s.editPathParams || '{}');
          Object.keys(pathParams).forEach(function(key) {
            url = url.replace('{' + key + '}', encodeURIComponent(pathParams[key]));
          });
        } catch (e) {}

        try {
          var queryParams = JSON.parse(s.editQueryParams || '{}');
          var queryKeys = Object.keys(queryParams);
          if (queryKeys.length > 0) {
            var qs = queryKeys.map(function(k) {
              return encodeURIComponent(k) + '=' + encodeURIComponent(queryParams[k]);
            }).join('&');
            url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
          }
        } catch (e) {}

        // Build headers - only Authorization for tool calls
        var fetchHeaders = {};
        var toolSettings = loadToolSettings();
        // Only add Authorization header if there's a non-empty API key
        var toolApiKey = toolSettings.apiKey && typeof toolSettings.apiKey === 'string' ? toolSettings.apiKey.trim() : '';
        if (toolApiKey) {
          fetchHeaders['Authorization'] = 'Bearer ' + toolApiKey;
        }

        var fetchOpts = {
          method: s.editMethod,
          headers: fetchHeaders,
        };

        if (s.editMethod === 'POST') {
          try {
            fetchOpts.body = s.editBody;
          } catch (e) {}
        }

        self.setState({ toolCallResponse: { status: 'loading', body: '' } });


        fetch(url, fetchOpts)
          .then(function(res) {
            return res.text().then(function(text) {
              var responseObj = { status: res.status, statusText: res.statusText, body: text };
              self.setState({ toolCallResponse: responseObj });
              self.sendToolResult(responseObj);
            });
          })
          .catch(function(err) {
            var responseObj = { status: 0, statusText: 'Network Error', body: err.message };
            console.error('[Tool Call Error]', err.message);
            self.setState({ toolCallResponse: responseObj });
            self.sendToolResult(responseObj);
          });
      }

      sendToolResult(responseObj) {
        var self = this;
        var s = this.state;

        if (s.toolRetryCount >= 3) {
          var lastError = 'Status ' + responseObj.status + ' ' + (responseObj.statusText || '');
          var lastBody = (responseObj.body || '').substring(0, 500);
          var errorDetail = lastError + (lastBody ? '\n\n```\n' + lastBody + '\n```' : '');
          console.error('[Tool Call] Max retries reached.');
          self.addMessage({
            role: 'assistant',
            content: 'Max tool call retries (3) reached. Last error: ' + errorDetail + '\n\nPlease try a different approach.',
            messageId: generateMessageId()
          });
          self.setState({ pendingToolCall: null, isTyping: false });
          return;
        }

        var toolCallId = s.pendingToolCall ? s.pendingToolCall.id : 'call_unknown';

        var truncatedBody = (responseObj.body || '').substring(0, 4000);
        var resultContent = 'Status: ' + responseObj.status + ' ' + (responseObj.statusText || '') + '\n\n' + truncatedBody;

        var toolResultMsg = {
          role: 'tool',
          content: resultContent,
          tool_call_id: toolCallId,
          messageId: generateMessageId(),
          _displayContent: 'Tool result: Status ' + responseObj.status
        };

        var currentHistory = (self.state.chatHistory || []).slice();
        currentHistory.push(toolResultMsg);

        var apiMessages = currentHistory.map(function(m) {
          var msg = { role: m.role };
          if (m.content != null) msg.content = m.content;
          if (m.tool_calls) msg.tool_calls = m.tool_calls;
          if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
          if (!m.tool_calls && msg.content == null) msg.content = m._displayContent || '';
          return msg;
        });

        self.addMessage(toolResultMsg);

        var streamMsgId = generateMessageId();
        var isError = responseObj.status < 200 || responseObj.status >= 300;
        self.setState({
          pendingToolCall: null,
          toolRetryCount: isError ? s.toolRetryCount + 1 : 0,
        });

        var fullSchema = null;
        try {
          var storedSettings = loadFromStorage();
          if (storedSettings.openapiSchema) fullSchema = storedSettings.openapiSchema;
        } catch (e) {}

        self._streamLLMResponse(apiMessages, streamMsgId, fullSchema);
      }

      // ── Error classification and user-friendly messages ─────────────────────
      _getErrorMessage(err, responseText) {
        var errorMsg = err.message || "Request failed";
        var details = "";
        
        try {
          if (responseText) {
            var parsed = JSON.parse(responseText);
            if (parsed.details) details = parsed.details;
            else if (parsed.error) details = parsed.error;
          }
        } catch (e) {
          if (responseText && responseText.length < 500) {
            details = responseText;
          }
        }

        var lowerError = (errorMsg + ' ' + details).toLowerCase();
        
        if (lowerError.includes('connection refused') || 
            lowerError.includes('connect timeout') ||
            lowerError.includes('network') ||
            lowerError.includes('econnrefused') ||
            lowerError.includes('enotfound') ||
            lowerError.includes('fetch failed')) {
          return {
            title: "Connection Failed",
            message: "Could not connect to your LLM provider. Please verify your Base URL in Settings.",
            action: "Check Settings",
            needsSettings: true
          };
        }
        
        if (lowerError.includes('401') || 
            lowerError.includes('403') || 
            lowerError.includes('unauthorized') ||
            lowerError.includes('invalid api key') ||
            lowerError.includes('authentication') ||
            lowerError.includes('api key')) {
          return {
            title: "Authentication Failed",
            message: "Your API key appears to be invalid or missing. Please check your API Key in Settings.",
            action: "Check Settings",
            needsSettings: true
          };
        }
        
        if (lowerError.includes('404') || 
            lowerError.includes('not found') ||
            lowerError.includes('model')) {
          return {
            title: "Resource Not Found",
            message: "The requested resource was not found. This might mean your Model ID is incorrect or the endpoint doesn't exist.",
            action: "Check Settings",
            needsSettings: true
          };
        }
        
        if (lowerError.includes('429') || 
            lowerError.includes('rate limit') ||
            lowerError.includes('too many requests')) {
          return {
            title: "Rate Limited",
            message: "You've sent too many requests. Please wait a moment and try again.",
            action: null,
            needsSettings: false
          };
        }
        
        if (lowerError.includes('timeout') || 
            lowerError.includes('timed out')) {
          return {
            title: "Request Timeout",
            message: "The request took too long. The LLM provider may be busy or experiencing issues.",
            action: null,
            needsSettings: false
          };
        }
        
        if (lowerError.includes('500') || 
            lowerError.includes('502') || 
            lowerError.includes('503') ||
            lowerError.includes('504') ||
            lowerError.includes('server error')) {
          return {
            title: "Server Error",
            message: "The LLM provider's server encountered an error. This is usually a temporary issue.",
            action: null,
            needsSettings: false
          };
        }
        
        // Check for CORS errors based on network fetch behavior, not string matching
        // Only flag as CORS if we get a network-level failure with no response
        var isNetworkError = errorMsg.toLowerCase().includes('network error') || 
                             errorMsg.toLowerCase().includes('failed to fetch') ||
                             (errorMsg && !responseText);
        
        // True CORS errors typically show "Failed to fetch" or "NetworkError" 
        // with status 0 and no response
        if (responseObj && responseObj.status === 0 && isNetworkError) {
          return {
            title: "CORS Error",
            message: "Cross-origin request blocked. This is usually a configuration issue with the LLM provider.\n\nEnsure your LLM server has CORS enabled. For Ollama, LM Studio, or vLLM, this is typically enabled by default.",
            action: null,
            needsSettings: false
          };
        }
        
        return {
          title: "Request Failed",
          message: details || errorMsg,
          action: "Check Settings",
          needsSettings: true
        };
      }

      _renderErrorInChat(errorInfo) {
        var React = system.React;
        var children = [
          React.createElement("div", { className: "llm-error-title" }, errorInfo.title),
          React.createElement("div", { className: "llm-error-text" }, errorInfo.message)
        ];

        if (errorInfo.needsSettings) {
          children.push(
            React.createElement("div", { className: "llm-error-actions" },
              React.createElement("button", {
                className: "llm-error-action-btn",
                onClick: function() { window.llmOpenSettings && window.llmOpenSettings(); }
              }, "\u2699\uFE0F " + errorInfo.action)
            )
          );
        }

        return React.createElement("div", { className: "llm-error-message" }, children);
      }

      // ── Direct LLM streaming helper (no server proxy) ───────────────────────
      _streamLLMResponse(apiMessages, streamMsgId, fullSchema) {
        var self = this;
        var settings = loadFromStorage();
        var toolSettings = loadToolSettings();

        // Get system prompt from preset
        var selectedPreset = this.state.selectedPreset || 'api_assistant';
        var systemPrompt = getSystemPromptForPreset(selectedPreset, fullSchema);
        
        // Add tool calling instructions if enabled
        if (toolSettings.enableTools) {
          systemPrompt += "\n\nYou have access to the `api_request` tool to execute API calls. When the user asks you to call an endpoint, use the tool instead of just showing a curl command. If a tool call returns an error, you may retry with corrected parameters (up to 3 times).";
        }

        var scrollToBottom = function() {
          var el = document.getElementById('llm-chat-messages');
          if (el) el.scrollTop = el.scrollHeight;
        };

        self.addMessage({ role: 'assistant', content: '', messageId: streamMsgId });

        self._currentCancelToken = new AbortController();
        self.setState({ isTyping: true });

        var accumulated = "";
        var currentStreamMessageId = streamMsgId;
        
        var lastResponseText = "";

        var accumulatedToolCalls = {};

        var finalize = function(content, saveContent, isError) {
          if (saveContent && content && content.trim() && content !== "*(cancelled)*") {
            var isErrorMsg = isError || (content && content.toLowerCase().startsWith('error:'));
            
            if (isErrorMsg) {
              var errorInfo = self._getErrorMessage({ message: content }, lastResponseText);
              self.addMessage({
                role: 'assistant',
                content: content,
                messageId: streamMsgId,
                isError: true,
                _errorInfo: errorInfo
              });
            } else {
              self.addMessage({ role: 'assistant', content: content, messageId: streamMsgId });
            }
          }
          self._currentCancelToken = null;
          self.setState({ isTyping: false });
          setTimeout(scrollToBottom, 30);
        };

        // Build messages array with system prompt
        var messages = [{ role: 'system', content: systemPrompt }].concat(apiMessages);

        // Build tools definition if enabled
        var payload = {
          messages: messages,
          model: settings.modelId || "llama3",
          max_tokens: settings.maxTokens != null && settings.maxTokens !== '' ? parseInt(settings.maxTokens) : 4096,
          temperature: settings.temperature != null && settings.temperature !== '' ? parseFloat(settings.temperature) : 0.7,
          stream: true,
        };

        if (toolSettings.enableTools && fullSchema) {
          payload.tools = [buildApiRequestTool(fullSchema)];
          payload.tool_choice = "auto";
        }

        // Build headers
        var fetchHeaders = {
          "Content-Type": "application/json",
        };
        if (settings.apiKey) {
          fetchHeaders["Authorization"] = "Bearer " + settings.apiKey;
        }

        var baseUrl = (settings.baseUrl || "").replace(/\/+$/, "");
        
        fetch(baseUrl + "/chat/completions", {
          method: "POST",
          headers: fetchHeaders,
          body: JSON.stringify(payload),
          signal: self._currentCancelToken.signal
        })
          .then(function (res) {
            if (!res.ok) {
              return res.text().then(function(text) {
                throw new Error("HTTP " + res.status + ": " + res.statusText + (text ? " - " + text : ""));
              });
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
                  var payloadData = line.substring(6);

                  if (payloadData === "[DONE]") {
                    finalize(accumulated || "Sorry, I couldn't get a response.", true);
                    return;
                  }

                  try {
                    var chunk = JSON.parse(payloadData);
                    if (chunk.error) {
                      finalize("Error: " + chunk.error + (chunk.details ? ": " + chunk.details : ""), true, true);
                      return;
                    }

                    var choice = chunk.choices && chunk.choices[0];
                    if (!choice) continue;

                    if (choice.delta && choice.delta.content) {
                      accumulated += choice.delta.content;
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

                    if (choice.delta && choice.delta.tool_calls) {
                      choice.delta.tool_calls.forEach(function(tc) {
                        var idx = tc.index != null ? tc.index : 0;
                        if (!accumulatedToolCalls[idx]) {
                          accumulatedToolCalls[idx] = { id: '', function: { name: '', arguments: '' } };
                        }
                        if (tc.id) accumulatedToolCalls[idx].id = tc.id;
                        if (tc.function) {
                          if (tc.function.name) accumulatedToolCalls[idx].function.name = tc.function.name;
                          if (tc.function.arguments) accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
                        }
                      });
                    }

                    if (choice.finish_reason === "tool_calls") {
                      var toolCallsList = Object.keys(accumulatedToolCalls).map(function(k) {
                        return accumulatedToolCalls[k];
                      });

                      if (toolCallsList.length > 0) {
                        var tc = toolCallsList[0];
                        var args = {};
                        try {
                          args = JSON.parse(tc.function.arguments || '{}');
                        } catch (e) {
                          args = {};
                        }

                        var assistantToolMsg = {
                          role: 'assistant',
                          content: null,
                          tool_calls: toolCallsList.map(function(t) {
                            return { id: t.id, type: 'function', function: { name: t.function.name, arguments: t.function.arguments } };
                          }),
                          messageId: streamMsgId
                        };
                        self._lastToolCallAssistantMsg = assistantToolMsg;
                        self._pendingToolCallMsg = assistantToolMsg;

                        self.setState(function(prev) {
                          var history = (prev.chatHistory || []).filter(function(m) {
                            return m.messageId !== streamMsgId;
                          });
                          saveChatHistory(history);
                          return { chatHistory: history };
                        });

                        self.setState({
                          isTyping: false,
                          pendingToolCall: tc,
                          editMethod: args.method || 'GET',
                          editPath: args.path || '',
                          editQueryParams: JSON.stringify(args.query_params || {}, null, 2),
                          editPathParams: JSON.stringify(args.path_params || {}, null, 2),
                          editBody: JSON.stringify(args.body || {}, null, 2),
                          toolCallResponse: null,
                        });
                        self._currentCancelToken = null;

                        if (toolSettings.autoExecute) {
                          setTimeout(function() { self.handleExecuteToolCall(); }, 100);
                        }
                        return;
                      }
                    }
                  } catch (e) {
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
              finalize("Error: " + (err.message || "Request failed"), true, true);
            }
          });

        setTimeout(scrollToBottom, 50);
      }

      handleSend() {
        if (!this.state.input.trim() || this.state.isTyping) return;

        var self = this;
        var userInput = this.state.input.trim();
        var msgId = generateMessageId();
        var streamMsgId = generateMessageId();

        self._pendingToolCallMsg = null;
        self.setState({ input: "", pendingToolCall: null, toolCallResponse: null, toolRetryCount: 0 });

        var userMsg = { role: 'user', content: userInput, messageId: msgId };
        var currentHistory = self.state.chatHistory || [];
        var apiMessages = currentHistory.concat([userMsg]).map(function (m) {
          var msg = { role: m.role };
          if (m.content != null) msg.content = m.content;
          if (m.tool_calls) msg.tool_calls = m.tool_calls;
          if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
          if (!m.tool_calls && msg.content == null) msg.content = m._displayContent || '';
          return msg;
        });

        self.addMessage(userMsg);

        var fullSchema = null;
        try {
          var storedSettings = loadFromStorage();
          if (storedSettings.openapiSchema) fullSchema = storedSettings.openapiSchema;
        } catch (e) {}

        self._streamLLMResponse(apiMessages, streamMsgId, fullSchema);
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

      copyToClipboard(text, messageId) {
        if (!text || !navigator.clipboard) return;
        var self = this;
        navigator.clipboard.writeText(text).then(function () {
          self.setState({ copiedMessageId: messageId });
          if (self._copyTimeoutId) clearTimeout(self._copyTimeoutId);
          self._copyTimeoutId = setTimeout(function () {
            self._copyTimeoutId = null;
            self.setState({ copiedMessageId: null });
          }, 2000);
        }).catch(function (err) {
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
        var isTool = msg.role === 'tool';
        var isToolCallMsg = msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0;

        var chatHistory = self.state.chatHistory || [];
        var isStreamingThisMessage = self.state.isTyping &&
          !isUser &&
          idx === chatHistory.length - 1 &&
          msg.role === 'assistant';

        if (isToolCallMsg) {
          var toolArgs = msg._toolArgs || {};
          var tcMethod = toolArgs.method || 'GET';
          var tcPath = toolArgs.path || '';
          
          return React.createElement(
            "div",
            { key: msg.messageId || msg.timestamp, className: "llm-chat-message-wrapper" },
            React.createElement(
              "div",
              {
                className: "llm-chat-message assistant",
                style: { maxWidth: "90%", borderLeft: "3px solid #8b5cf6" }
              },
              React.createElement("div", { className: "llm-avatar assistant-avatar" }, "\uD83D\uDD27"),
              React.createElement(
                "div",
                { style: { flex: 1, minWidth: 0 } },
                React.createElement(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" } },
                  React.createElement("span", { style: { fontSize: "13px", fontWeight: "600", color: "#8b5cf6" } }, "api_request"),
                  React.createElement("span", {
                    style: {
                      background: tcMethod === 'POST' ? '#f59e0b' : '#10b981',
                      color: '#fff',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: '600',
                      fontFamily: "'Consolas', 'Monaco', monospace",
                    }
                  }, tcMethod),
                  React.createElement("span", {
                    style: { fontSize: "13px", fontFamily: "'Consolas', 'Monaco', monospace", color: "var(--theme-text-primary)" }
                  }, tcPath)
                )
              )
            )
          );
        }

        if (isTool) {
          var statusLine = msg._displayContent || 'Tool result';
          var responseBody = '';
          var statusColor = '#10b981';
          if (msg.content) {
            var parts = msg.content.split('\n\n');
            var statusPart = parts[0] || '';
            responseBody = parts.slice(1).join('\n\n');
            var statusMatch = statusPart.match(/Status:\s*(\d+)/);
            if (statusMatch) {
              var code = parseInt(statusMatch[1]);
              statusColor = (code >= 200 && code < 300) ? '#10b981' : '#f87171';
            }
          }
          var formattedBody = responseBody;
          try {
            var parsed = JSON.parse(responseBody);
            formattedBody = JSON.stringify(parsed, null, 2);
          } catch (e) {}

          return React.createElement(
            "div",
            { key: msg.messageId || msg.timestamp, className: "llm-chat-message-wrapper" },
            React.createElement(
              "div",
              {
                className: "llm-chat-message assistant",
                style: { maxWidth: "90%", borderLeft: "3px solid " + statusColor }
              },
              React.createElement("div", { className: "llm-avatar assistant-avatar", style: { background: "linear-gradient(135deg, " + statusColor + ", #059669)" } }, "\uD83D\uDCE1"),
              React.createElement(
                "div",
                { style: { flex: 1, minWidth: 0 } },
                React.createElement(
                  "div",
                  {
                    className: "llm-chat-message-header",
                    style: { display: "flex", justifyContent: "space-between", alignItems: "center" }
                  },
                  React.createElement("span", { style: { fontSize: "13px", fontWeight: "600", color: statusColor } }, statusLine),
                  React.createElement(
                    "button",
                    {
                      className: "llm-copy-btn",
                      onClick: function() { self.copyToClipboard(responseBody, msg.messageId); },
                      title: "Copy response",
                      style: { opacity: 1 }
                    },
                    self.state.copiedMessageId === msg.messageId ? "\u2705" : "\uD83D\uDCCB"
                  )
                ),
                formattedBody ? React.createElement(
                  "pre",
                  {
                    style: {
                      background: "var(--theme-input-bg)",
                      border: "1px solid var(--theme-border-color)",
                      borderRadius: "6px",
                      padding: "8px 10px",
                      fontSize: "11px",
                      fontFamily: "'Consolas', 'Monaco', monospace",
                      maxHeight: "200px",
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      color: "var(--theme-text-primary)",
                      margin: "6px 0 0 0",
                      lineHeight: "1.4",
                    }
                  },
                  formattedBody.substring(0, 2000)
                ) : null
              )
            )
          );
        }

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
            }, "\uD83E\uDD16"),
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
                  onClick: function() { self.copyToClipboard(msg.content, msg.messageId); },
                  title: "Copy message",
                  style: { opacity: (self.state.headerHover[msg.messageId || msg.timestamp] || self.state.copiedMessageId === msg.messageId) && !isStreamingThisMessage ? 1 : 0 }
                },
                self.state.copiedMessageId === msg.messageId ? "\u2705" : "\uD83D\uDCCB"
              )
            ),
            React.createElement(
              "div",
              { className: "llm-chat-message-content" },
              msg._errorInfo
                ? this._renderErrorInChat(msg._errorInfo)
                : this.formatMessageContent(msg.content, isStreamingThisMessage)
            )
          )
        );
      }

      formatMessageContent(content, isStreaming) {
        var React = system.React;
        
        if (!content || !content.trim()) {
          if (isStreaming) {
            return React.createElement("span", { 
              className: "llm-streaming-indicator",
              style: { fontStyle: 'italic', opacity: 0.7, fontSize: '13px', marginTop: '8px' }
            }, "Stream starting...");
          }
          return null;
        }
        
        var html = parseMarkdown(content);
        
        return React.createElement("div", {
          className: "llm-chat-message-text",
          style: { fontSize: '15px', lineHeight: '1.6', wordWrap: 'break-word', overflowWrap: 'break-word' },
          dangerouslySetInnerHTML: { __html: html }
        });
      }

      renderToolCallPanel() {
        var React = system.React;
        var self = this;
        var s = this.state;

        if (!s.pendingToolCall) return null;

        var panelStyle = {
          padding: "10px 12px",
          borderTop: "1px solid var(--theme-border-color)",
          background: "var(--theme-panel-bg)",
          fontSize: "13px",
        };
        var inputStyle = {
          background: "var(--theme-input-bg)",
          border: "1px solid var(--theme-border-color)",
          borderRadius: "4px",
          color: "var(--theme-text-primary)",
          padding: "5px 8px",
          fontSize: "12px",
          fontFamily: "'Consolas', 'Monaco', monospace",
          width: "100%",
          boxSizing: "border-box",
        };
        var labelStyle = { color: "var(--theme-text-secondary)", fontSize: "11px", marginBottom: "2px" };
        var headerStyle = { color: "var(--theme-text-primary)", fontSize: "13px", fontWeight: "600", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px", justifyContent: "space-between" };

        return React.createElement(
          "div",
          { style: panelStyle },
          React.createElement("div", { style: headerStyle },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
              "\uD83D\uDD27 ",
              React.createElement("span", null, "api_request"),
              React.createElement("span", { style: { color: "var(--theme-text-secondary)", fontWeight: "400", fontSize: "12px" } },
                s.editMethod + " " + s.editPath
              )
            )
          ),
          React.createElement("div", { style: { display: "flex", gap: "6px", marginBottom: "8px", alignItems: "flex-end" } },
            React.createElement(
              "div",
              { style: { flex: "0 0 80px" } },
              React.createElement("div", { style: labelStyle }, "Method"),
              React.createElement("select", { value: s.editMethod, onChange: function(e) { self.setState({ editMethod: e.target.value }); }, style: inputStyle },
                React.createElement("option", { value: "GET" }, "GET"),
                React.createElement("option", { value: "POST" }, "POST")
              )
            ),
            React.createElement(
              "div",
              { style: { flex: 1 } },
              React.createElement("div", { style: labelStyle }, "Path"),
              React.createElement("input", { type: "text", value: s.editPath, onChange: function(e) { self.setState({ editPath: e.target.value }); }, style: inputStyle })
            ),
            React.createElement(
              "div",
              { style: { flex: 1 } },
              React.createElement("div", { style: labelStyle }, "Query"),
              React.createElement("input", { type: "text", value: s.editQueryParams, onChange: function(e) { self.setState({ editQueryParams: e.target.value }); }, style: inputStyle, placeholder: '{}' })
            )
          ),
          s.editMethod === 'POST' && React.createElement("div", { style: { marginBottom: "8px" } },
            React.createElement("div", { style: Object.assign({}, labelStyle, { display: "flex", alignItems: "center", justifyContent: "space-between" }) }, 
              "Body",
              React.createElement("span", { style: { fontSize: "10px", color: "var(--theme-text-secondary)", fontWeight: "400" } }, "JSON")
            ),
            React.createElement("textarea", { value: s.editBody, onChange: function(e) { self.setState({ editBody: e.target.value }); }, style: Object.assign({}, inputStyle, { resize: "vertical", minHeight: "72px" }), rows: 4, placeholder: '{}' })
          ),
          React.createElement(
            "div",
            { style: { display: "flex", gap: "8px" } },
            React.createElement("button", {
              onClick: self.handleExecuteToolCall,
              style: { background: "var(--theme-primary)", color: "#fff", border: "none", borderRadius: "4px", padding: "5px 14px", cursor: "pointer", fontSize: "12px", fontWeight: "500" }
            }, "\u25B6 Execute"),
            React.createElement("button", {
              onClick: function() { self._pendingToolCallMsg = null; self.setState({ pendingToolCall: null, toolCallResponse: null }); },
              style: { background: "var(--theme-accent)", color: "#fff", border: "none", borderRadius: "4px", padding: "5px 14px", cursor: "pointer", fontSize: "12px" }
            }, "Dismiss")
          )
        );
      }

      render() {
        var React = system.React;
        var self = this;
        var chatHistory = this.state.chatHistory || [];

        return React.createElement(
          "div",
          { className: "llm-chat-container", style: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 90px)', minHeight: '300px' } },
          React.createElement(
            "div",
            { id: "llm-chat-messages", style: { flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', scrollBehavior: 'smooth' } },
            chatHistory.length === 0
              ? React.createElement(
                  "div",
                  { style: { textAlign: 'center', color: 'var(--theme-text-secondary)', padding: '40px 20px', fontSize: '15px', whiteSpace: 'pre-line' } },
                  "Ask questions about your API!\n\nExamples:\n• What endpoints are available?\n• How do I use the chat completions endpoint?\n• Generate a curl command for /health"
                )
              : chatHistory.map(this.renderMessage)
            ),
          this.state.isTyping
            ? React.createElement(
                "div",
                { style: { padding: '8px 12px', color: 'var(--theme-text-secondary)', fontSize: '12px' } },
                this.renderTypingIndicator()
              )
            : null,
          this.state.pendingToolCall && !this.state.isTyping ? this.renderToolCallPanel() : null,
          React.createElement(
            "div",
            { className: "llm-chat-input-area", style: { borderTop: '1px solid var(--theme-border-color)', padding: '12px', width: '100%', maxWidth: '100%', boxSizing: 'border-box', flexShrink: 0 } },
            React.createElement("textarea", {
              value: this.state.input,
              onChange: this.handleInputChange,
              onKeyDown: this.handleKeyDown,
              placeholder: "Ask about your API... (Shift+Enter for new line)",
              style: { width: '100%', background: 'var(--theme-input-bg)', border: '1px solid var(--theme-border-color)', borderRadius: '4px', color: 'var(--theme-text-primary)', padding: '10px 12px', fontSize: '14px', resize: 'vertical', fontFamily: "'Inter', sans-serif", minHeight: '44px', maxHeight: '200px', overflowWrap: 'break-word', wordWrap: 'break-word', overflowX: 'hidden', boxSizing: 'border-box', lineHeight: '1.5' },
              rows: 2
            }),
            React.createElement(
              "div",
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' } },
              React.createElement(
                "button",
                {
                  onClick: this.clearHistory,
                  style: { border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500', transition: 'all 0.2s ease', background: 'var(--theme-accent)', color: '#fff', padding: '8px 12px' }
                },
                "Clear"
              ),
              React.createElement(
                "div",
                { style: { display: 'flex', gap: '8px' } },
                this.state.isTyping && React.createElement(
                  "button",
                  {
                    onClick: function() { 
                      if (self._currentCancelToken) self._currentCancelToken.abort(); 
                    },
                    style: { border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500', background: '#dc2626', color: '#fff', padding: '8px 16px' }
                  },
                "❌ Cancel"
              ),
              React.createElement(
                "button",
                {
                  onClick: this.handleSend,
                  disabled: !this.state.input.trim() || this.state.isTyping,
                  style: { border: 'none', borderRadius: '6px', cursor: (!this.state.input.trim() || this.state.isTyping) ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '500', transition: 'all 0.2s ease', background: (!this.state.input.trim() || this.state.isTyping) ? 'var(--theme-primary)' : 'var(--theme-primary)', opacity: (!this.state.input.trim() || this.state.isTyping) ? 0.6 : 1, color: '#fff', padding: '8px 16px' }
                },
                this.state.isTyping ? "..." : "Send"
              )
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
        var ts = loadToolSettings();
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
          availableModels: [],
          enableTools: ts.enableTools || false,
          autoExecute: ts.autoExecute || false,
          toolApiKey: ts.apiKey || '',
        };
        this._debouncedSave = debounce(this._saveSettings.bind(this), 300);
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

      _saveSettings() {
        var settings = {
          baseUrl: this.state.baseUrl,
          apiKey: this.state.apiKey,
          modelId: this.state.modelId,
          maxTokens: this.state.maxTokens !== '' ? this.state.maxTokens : null,
          temperature: this.state.temperature !== '' ? this.state.temperature : null,
          provider: this.state.provider,
        };
        saveToStorage(settings);
        saveToolSettings({
          enableTools: this.state.enableTools,
          autoExecute: this.state.autoExecute,
          apiKey: this.state.toolApiKey,
        });
        saveTheme({ theme: this.state.theme, customColors: this.state.customColors });
      }

      _autoSave() {
        this._debouncedSave();
      }

      componentDidMount() {
        var stored = loadTheme();
        this.setState({ 
          theme: stored.theme || DEFAULT_STATE.theme, 
          customColors: stored.customColors || {} 
        });
        
        requestAnimationFrame(function() {
          window.applyLLMTheme(stored.theme || DEFAULT_STATE.theme, stored.customColors);
        });
      }

      componentDidUpdate(prevProps, prevState) {
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
        saveToolSettings({
          enableTools: this.state.enableTools,
          autoExecute: this.state.autoExecute,
          apiKey: this.state.toolApiKey,
        });
        saveTheme({ theme: this.state.theme, customColors: this.state.customColors });
      }

      handleTestConnection() {
        var self = this;
        var settings = {
          baseUrl: this.state.baseUrl,
          apiKey: this.state.apiKey,
          modelId: this.state.modelId,
        };
        saveToStorage(settings);
        self.setState({ connectionStatus: "connecting", lastError: "" });
        dispatchAction(system, 'setConnectionStatus', "connecting");

        // Build headers
        var headers = { "Content-Type": "application/json" };
        if (settings.apiKey) {
          headers["Authorization"] = "Bearer " + settings.apiKey;
        }

        var baseUrl = (settings.baseUrl || "").replace(/\/+$/, "");
        
        fetch(baseUrl + "/models", {
          method: 'GET',
          headers: headers
        })
          .then(function (res) {
            if (!res.ok) {
              return res.text().then(function(text) { 
                throw new Error('HTTP ' + res.status + ': ' + res.statusText + (text ? " - " + text : "")); 
              });
            }
            return res.json();
          })
          .then(function (data) {
            if (data && data.error) {
              throw new Error(data.details || data.error);
            }
            var models = [];
            if (data && Array.isArray(data.data)) {
              models = data.data
                .map(function(m) { return m.id || m.name || ''; })
                .filter(function(id) { return id !== ''; })
                .sort();
            }
            var newState = { connectionStatus: "connected", availableModels: models };
            if (models.length > 0 && models.indexOf(self.state.modelId) === -1) {
              newState.modelId = models[0];
              dispatchAction(system, 'setModelId', models[0]);
            }
            self.setState(newState);
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
        this.setState({ provider: value, baseUrl: provider.url, availableModels: [], connectionStatus: "disconnected" });
        dispatchAction(system, 'setProvider', value);
        this._autoSave();
      }

      handleBaseUrlChange(e) {
        this.setState({ baseUrl: e.target.value });
        dispatchAction(system, 'setBaseUrl', e.target.value);
        this._autoSave();
      }

      handleApiKeyChange(e) {
        this.setState({ apiKey: e.target.value });
        dispatchAction(system, 'setApiKey', e.target.value);
        this._autoSave();
      }

      handleModelIdChange(e) {
        this.setState({ modelId: e.target.value });
        dispatchAction(system, 'setModelId', e.target.value);
        this._autoSave();
      }

      handleMaxTokensChange(e) {
        this.setState({ maxTokens: e.target.value });
        dispatchAction(system, 'setMaxTokens', e.target.value);
        this._autoSave();
      }

      handleTemperatureChange(e) {
        this.setState({ temperature: e.target.value });
        dispatchAction(system, 'setTemperature', e.target.value);
        this._autoSave();
      }

      handleThemeChange(e) {
        var value = e.target.value;
        this.setState({ theme: value });
        dispatchAction(system, 'setTheme', value);
        this._autoSave();
      }

      handleColorChange(colorKey, e) {
        var value = e.target.value;
        this.setState(function (prev) {
          var newColors = Object.assign({}, prev.customColors || {});
          newColors[colorKey] = value;
          return { customColors: newColors };
        });
        dispatchAction(system, 'setCustomColor', { key: colorKey, value: value });
        this._autoSave();
      }

      handleEnableToolsChange(e) {
        this.setState({ enableTools: e.target.checked });
        this._autoSave();
      }

      handleAutoExecuteChange(e) {
        this.setState({ autoExecute: e.target.checked });
        this._autoSave();
      }

      handleToolApiKeyChange(e) {
        this.setState({ toolApiKey: e.target.value });
        this._autoSave();
      }

      render() {
        var self = this;
        var s = this.state;
        var React = system.React;

        var statusEmoji = STATUS_EMOJI[s.connectionStatus] || "⚪";
        var provider = LLM_PROVIDERS[s.provider] || LLM_PROVIDERS.custom;

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

        var providerOptions = Object.keys(LLM_PROVIDERS).map(function (key) {
          return React.createElement(
            "option",
            { key: key, value: key },
            LLM_PROVIDERS[key].name
          );
        });

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

        var providerBadge = React.createElement(
          "span",
          { className: "llm-provider-badge llm-provider-" + (s.provider === 'custom' ? 'openai' : s.provider), style: { fontSize: "10px", padding: "2px 8px", borderRadius: "10px", marginLeft: "8px" } },
          provider.name
        );

        var baseUrlField = React.createElement(
          "div",
          { style: fieldStyle },
          React.createElement("label", { style: labelStyle }, "Base URL"),
          React.createElement("input", {
            type: "text",
            value: s.baseUrl,
            style: inputStyle,
            onChange: this.handleBaseUrlChange,
          })
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
            s.availableModels.length > 0
              ? React.createElement(
                  "select",
                  {
                    value: s.modelId,
                    style: inputStyle,
                    onChange: this.handleModelIdChange,
                  },
                  s.availableModels.map(function (model) {
                    return React.createElement("option", { key: model, value: model }, model);
                  })
                )
              : React.createElement("input", {
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

        var checkboxStyle = { marginRight: "8px", cursor: "pointer" };
        var checkboxLabelStyle = { color: "var(--theme-text-primary)", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center" };
        var toolCallSettings = React.createElement(
          "div",
          { style: { marginBottom: "24px", paddingBottom: "20px", borderBottom: "1px solid var(--theme-border-color)" } },
          React.createElement("h3", { style: { color: "var(--theme-text-primary)", fontSize: "14px", fontWeight: "600", marginBottom: "12px" } }, "Tool Calling (API Execution)"),
          React.createElement(
            "div",
            { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 20px", alignItems: "start" } },
            React.createElement(
              "div",
              { style: fieldStyle },
              React.createElement(
                "label",
                { style: checkboxLabelStyle },
                React.createElement("input", {
                  type: "checkbox",
                  checked: s.enableTools,
                  onChange: this.handleEnableToolsChange,
                  style: checkboxStyle
                }),
                "Enable API Tool Calling"
              ),
              React.createElement("div", { style: { color: "var(--theme-text-secondary)", fontSize: "11px", marginTop: "4px" } },
                "Allow the LLM to execute API calls"
              )
            ),
            React.createElement(
              "div",
              { style: fieldStyle },
              React.createElement(
                "label",
                { style: checkboxLabelStyle },
                React.createElement("input", {
                  type: "checkbox",
                  checked: s.autoExecute,
                  onChange: this.handleAutoExecuteChange,
                  style: checkboxStyle,
                  disabled: !s.enableTools
                }),
                "Auto-Execute"
              ),
              React.createElement("div", { style: { color: "var(--theme-text-secondary)", fontSize: "11px", marginTop: "4px" } },
                "Execute tool calls without confirmation"
              )
            ),
            React.createElement(
              "div",
              { style: fieldStyle },
              React.createElement("label", { style: labelStyle }, "API Key for Tool Calls"),
              React.createElement("input", {
                type: "password",
                value: s.toolApiKey,
                placeholder: "Bearer token for target API",
                style: inputStyle,
                disabled: !s.enableTools,
                onChange: this.handleToolApiKeyChange
              })
            )
          )
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

        // System Prompt Preset section - for LLM Configuration tab in Settings
        var systemPromptPresetSelector = createSystemPromptPresetSelector(React);

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
            React.createElement("h3", { style: { color: "var(--theme-text-primary)", fontSize: "14px", fontWeight: "600", marginBottom: "12px" } }, "System Prompt Preset"),
            React.createElement("p", { style: { color: "var(--theme-text-secondary)", fontSize: "12px", marginBottom: "12px" } }, 
              "Select a preset system prompt that defines the assistant's behavior. The 'API Assistant' preset is optimized for REST API documentation."
            ),
          React.createElement(systemPromptPresetSelector, {
            value: s.systemPromptPreset || 'api_assistant',
            onChange: function(val) {
              this.setState({ systemPromptPreset: val });
              var stored = loadFromStorage();
              stored.systemPromptPreset = val;
              saveToStorage(stored);
            }.bind(this),
            customPrompt: s.customSystemPrompt || '',
            onCustomChange: function(val) {
              this.setState({ customSystemPrompt: val });
              var stored = loadFromStorage();
              stored.customSystemPrompt = val;
              saveToStorage(stored);
            }.bind(this),
            labelStyle: Object.assign({}, labelStyle, { color: "var(--theme-text-primary)" }),
            inputStyle: Object.assign({}, inputStyle, { marginBottom: '8px', fontSize: '12px' })
          })
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
          toolCallSettings,
          React.createElement(
            "div",
            { style: { display: "flex", alignItems: "center" } },
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

  // ── CSS styles object ────────────────────────────────────────────────────────
  var styles = {
    chatContainer: {
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 90px)",
      minHeight: "300px",
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
      width: "100%",
      maxWidth: "100%",
      boxSizing: "border-box",
      flexShrink: 0,
    },
    chatInput: {
      width: "100%",
      background: "var(--theme-input-bg)",
      border: "1px solid var(--theme-border-color)",
      borderRadius: "4px",
      color: "var(--theme-text-primary)",
      padding: "10px 12px",
      fontSize: "14px",
      resize: "vertical",
      fontFamily: "'Inter', sans-serif",
      minHeight: "44px",
      maxHeight: "200px",
      overflowWrap: "break-word",
      wordWrap: "break-word",
      overflowX: "hidden",
      boxSizing: "border-box",
      lineHeight: "1.5",
    },
    chatControls: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: "8px",
    },
    chatButton: {
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "12px",
      fontWeight: "500",
      transition: "all 0.2s ease",
    },
    chatButtonPrimary: {
      background: "var(--theme-primary)",
      color: "#fff",
      padding: "8px 16px",
    },
    chatButtonPrimaryHover: {
      background: "var(--theme-primary-hover)",
    },
    chatButtonDanger: {
      background: "#dc2626",
      color: "#fff",
      padding: "8px 16px",
    },
    chatButtonDangerHover: {
      background: "#b91c1c",
    },
    chatButtonSecondary: {
      background: "var(--theme-accent)",
      color: "#fff",
      padding: "8px 12px",
    },
    chatButtonSecondaryHover: {
      background: "#64748b",
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

  // ── CSS injection helper ───────────────────────────────────────────────────
  function injectStyles(id, css) {
    if (typeof document === 'undefined') return;
    
    var existing = document.getElementById(id);
    if (existing) {
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
    '.llm-chat-container { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }',
    
    '.llm-chat-messages { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; }',

    '.llm-chat-message-wrapper { display: flex; width: 100%; margin-bottom: 8px; box-sizing: border-box; }',

    '.llm-chat-message { padding: 10px 14px; border-radius: 12px; max-width: 85%; position: relative; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word; }',
    '.llm-chat-message.user { align-self: flex-end; background: var(--theme-primary); color: white; }',
    '.llm-chat-message.assistant { align-self: flex-start; background: var(--theme-secondary); color: var(--theme-text-primary); }',

    '.llm-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; margin-right: 8px; flex-shrink: 0; }',
    '.assistant-avatar { background: linear-gradient(135deg, #6366f1, #8b5cf6); }',
    '.llm-chat-message.assistant .llm-avatar { margin-right: 8px; }',

    '.llm-chat-message-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 11px; opacity: 0.9; flex-shrink: 0; }',
    '.llm-user-label { font-weight: 600; color: var(--theme-text-primary); }',
    '.llm-assistant-label { font-weight: 600; color: #8b5cf6; }',
    '.llm-chat-message-time { opacity: 0.7; font-size: 10px; }',

    '.llm-copy-btn { background: transparent; border: none; color: var(--theme-text-secondary); font-size: 14px; cursor: pointer; padding: 2px 6px; border-radius: 4px; transition: all 0.2s ease; margin-left: 8px; }',
    '.llm-copy-btn:hover { background: var(--theme-accent); color: white; transform: scale(1.1); }',

    '.llm-chat-message-text { font-size: 15px; line-height: 1.6; word-wrap: break-word; overflow-wrap: break-word; }',
    '.llm-chat-message-text p { margin: 8px 0; }',
    '.llm-chat-message-text p:first-child { margin-top: 4px; }',
    '.llm-chat-message-text p:last-child { margin-bottom: 4px; }',

    '.llm-streaming-indicator { color: var(--theme-accent); font-style: italic; opacity: 0.7; font-size: 13px; margin-top: 8px; }',

    '.llm-chat-message-text strong { color: var(--theme-text-primary); }',
    '.llm-chat-message-text em { font-style: italic; }',
    '.llm-chat-message-text ul { margin: 8px 0; padding-left: 24px; }',
    '.llm-chat-message-text ol { margin: 8px 0; padding-left: 24px; }',
    '.llm-chat-message-text li { margin: 4px 0; }',
    '.llm-chat-message-text blockquote { border-left: 3px solid var(--theme-accent); margin: 8px 0; padding-left: 12px; opacity: 0.9; }',
    '.llm-chat-message-text a { color: #60a5fa; text-decoration: none; }',
    '.llm-chat-message-text a:hover { text-decoration: underline; }',

    '.llm-chat-message-text pre { background: var(--theme-input-bg); border-radius: 8px; padding: 12px; overflow-x: auto; margin: 10px 0; font-family: "Consolas", "Monaco", monospace; font-size: 14px; position: relative; max-width: 100%; box-sizing: border-box; word-break: break-all; }',
    '.llm-chat-message-text code { font-family: "Consolas", "Monaco", monospace; background: rgba(0,0,0,0.15); padding: 2px 6px; border-radius: 4px; font-size: 13px; }',
    '.llm-chat-message-text pre code { background: transparent; padding: 0; }',

    '.code-block-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--theme-border-color); }',
    '.code-block-label { color: var(--theme-text-secondary); font-size: 12px; font-weight: 600; }',
    '.code-block-copy { background: var(--theme-secondary); border: none; color: var(--theme-text-primary); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; transition: all 0.2s; }',
    '.code-block-copy:hover { background: var(--theme-accent); color: white; }',
    '.code-block-copy.copied { background: #10b981 !important; color: white; }',

    '#llm-chat-messages::-webkit-scrollbar { width: 8px; }',
    '#llm-chat-messages::-webkit-scrollbar-track { background: var(--theme-panel-bg); border-radius: 4px; }',
    '#llm-chat-messages::-webkit-scrollbar-thumb { background: var(--theme-secondary); border-radius: 4px; }',
    '#llm-chat-messages::-webkit-scrollbar-thumb:hover { background: var(--theme-accent); }',

    '@keyframes typing { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }',
    '.llm-typing-indicator { display: inline-flex; align-items: center; gap: 4px; padding: 8px 12px; background: var(--theme-secondary); border-radius: 18px; font-size: 14px; margin-bottom: 8px; }',
    '.llm-typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--theme-text-secondary); animation: typing 1.4s infinite ease-in-out both; }',
    '.llm-typing-dot:nth-child(1) { animation-delay: -0.32s; }',
    '.llm-typing-dot:nth-child(2) { animation-delay: -0.16s; }',

    '.llm-chat-input-area { width: 100%; box-sizing: border-box; flex-shrink: 0; position: sticky; bottom: 0; }',
    
    '.llm-chat-input-area textarea { width: 100%; box-sizing: border-box; overflow-x: hidden; word-wrap: break-word; }',

    '@media (min-width: 769px) and (max-width: 1024px) {',
    '  .llm-chat-message { max-width: 80%; }',
    '  .llm-chat-messages { padding: 10px; }',
    '}',

    '@media (min-width: 1200px) {',
    '  .llm-chat-container { max-width: 100%; }',
    '  .llm-chat-message { max-width: 75%; }',
    '}',

    '@media (max-width: 768px) {',
    '  .llm-chat-message-wrapper { width: 100%; padding: 0 4px; margin-bottom: 6px; }',
    '  .llm-chat-message { max-width: 90%; padding: 8px 10px; }',
    '  .llm-avatar { width: 26px; height: 26px; font-size: 14px; margin-right: 6px; }',
    '  .llm-chat-message-text { font-size: 14px; }',
    '  .llm-typing-indicator { font-size: 13px; padding: 8px 12px; }',
    '  .llm-chat-messages { padding: 6px; gap: 6px; }',
    '  .llm-chat-message-header { font-size: 10px; }',
    '  .llm-chat-message-text pre { font-size: 12px; padding: 8px; }',
    '}',

    '@media (max-width: 768px) and (orientation: landscape) {',
    '  .llm-chat-container { height: calc(100dvh - 40px) !important; }',
    '}',

    '.llm-error-message {',
    '  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.1));',
    '  border: 1px solid rgba(239, 68, 68, 0.3);',
    '  border-radius: 8px;',
    '  padding: 12px 14px;',
    '  margin: 4px 0;',
    '}',
    '.llm-error-title {',
    '  color: #ef4444;',
    '  font-weight: 600;',
    '  font-size: 14px;',
    '  margin-bottom: 6px;',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '}',
    '.llm-error-title::before {',
    '  content: "⚠️";',
    '}',
    '.llm-error-text {',
    '  color: var(--theme-text-secondary);',
    '  font-size: 13px;',
    '  line-height: 1.5;',
    '}',
    '.llm-error-actions {',
    '  margin-top: 10px;',
    '}',
    '.llm-error-action-btn {',
    '  background: var(--theme-primary);',
    '  color: white;',
    '  border: none;',
    '  border-radius: 6px;',
    '  padding: 6px 14px;',
    '  font-size: 12px;',
    '  cursor: pointer;',
    '  transition: all 0.2s ease;',
    '}',
    '.llm-error-action-btn:hover {',
    '  background: var(--theme-primary-hover);',
    '  transform: translateY(-1px);',
    '}',
  ].join('\n');
  
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
    var validatedTheme = THEME_DEFINITIONS[themeName] ? themeName : 'dark';
    var themeDef = THEME_DEFINITIONS[validatedTheme];

    var finalColors = Object.assign({}, themeDef, customColors);

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
    ].join('; ');

    var css = ':root { ' + cssVars + ' }';
    var themeStyle = document.getElementById('swagger-llm-theme-styles');
    
    if (themeStyle) {
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

  // ── Global function to open settings tab ───────────────────────────────────
  window.llmOpenSettings = function() {
    try {
      localStorage.setItem("swagger-llm-active-tab", "settings");
    } catch (e) {
      console.warn('Failed to switch to settings tab:', e);
    }
  };
})();