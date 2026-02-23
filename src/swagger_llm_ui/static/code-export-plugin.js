// OpenAPI Schema Parser & Code Generator Plugin
// Provides schema parsing, curl generator, and code export functionality

(function () {
  "use strict";

  // ── OpenAPI Schema Parser ───────────────────────────────────────────────────
  function parseOpenAPISchema(schema) {
    if (!schema || typeof schema !== 'object') return null;

    var parsed = {
      info: schema.info || {},
      servers: schema.servers || [],
      paths: [],
    };

    // Parse paths
    if (schema.paths) {
      Object.entries(schema.paths).forEach(function ([path, methods]) {
        if (typeof methods !== 'object') return;

        Object.entries(methods).forEach(function ([method, spec]) {
          if (typeof spec !== 'object') return;

          var endpoint = {
            path: path,
            method: method.toUpperCase(),
            summary: spec.summary || spec.operationId || '',
            description: spec.description || '',
            tags: spec.tags || [],
            parameters: spec.parameters || [],
            requestBody: spec.requestBody,
            responses: spec.responses || {},
          };

          // Extract parameter details
          endpoint.parameters = (endpoint.parameters || []).map(function (p) {
            return {
              name: p.name,
              in: p.in, // query, header, path, cookie
              required: p.required || false,
              schema: p.schema || {},
              description: p.description || '',
            };
          });

          // Extract request body schema
          if (endpoint.requestBody && endpoint.requestBody.content) {
            var contentType = Object.keys(endpoint.requestBody.content)[0];
            if (contentType && endpoint.requestBody.content[contentType].schema) {
              endpoint.requestBodySchema = endpoint.requestBody.content[contentType].schema;
            }
          }

          parsed.paths.push(endpoint);
        });
      });
    }

    return parsed;
  }

  // Get simplified schema summary for chat context
  function getSchemaSummary(schema) {
    var parsed = parseOpenAPISchema(schema);
    if (!parsed || !parsed.paths) return '';

    var lines = [];
    lines.push('## API Endpoints');
    lines.push('');

    parsed.paths.forEach(function (ep) {
      var params = ep.parameters
        .filter(function (p) { return p.required; })
        .map(function (p) { return p.name + ':' + (p.schema.type || 'string'); })
        .join(', ');

      lines.push('- **' + ep.method + '** `' + ep.path + '`');
      if (ep.summary) lines.push('  - ' + ep.summary);
      if (params) lines.push('  - Required params: ' + params);
    });

    return lines.join('\n');
  }

  // ── Curl Generator ────────────────────────────────────────────────────────
  function generateCurlFromRequest(request, settings) {
    if (!request || !request.url) return '';

    var url = request.url;
    
    // Handle query parameters
    if (request.queryParams && Object.keys(request.requestBody || {}).length === 0) {
      var queryParams = Object.entries(request.queryParams)
        .map(function ([key, value]) { return key + '=' + encodeURIComponent(value); })
        .join('&');
      if (queryParams) {
        url = url.split('?')[0] + '?' + queryParams;
      }
    }

    var headers = request.headers || {};
    
    // Build curl command
    var curlParts = ['curl -X ' + request.method.toUpperCase()];

    // Add headers
    Object.entries(headers).forEach(function ([key, value]) {
      if (value !== undefined && key.toLowerCase() !== 'content-length') {
        var escapedValue = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        curlParts.push('  -H "' + key + ': ' + escapedValue + '" \\');
      }
    });

    // Add body if present
    if (request.body) {
      try {
        var body = JSON.parse(request.body);
        if (body && Object.keys(body).length > 0) {
          var bodyStr = JSON.stringify(body, null, 2);
          curlParts.push('  -d \'' + bodyStr.replace(/'/g, "'\\''") + '\' \\');
        }
      } catch (e) {
        // Body is not JSON, just add as-is
        curlParts.push('  -d \'' + String(request.body).replace(/'/g, "'\\''") + '\' \\');
      }
    }

    curlParts.push('  "' + url.replace(/"/g, '\\"') + '"');
    
    return curlParts.join('\n').replace(/\\\\\\'/g, "'").trim();
  }

  // ── Python Code Generator (httpx) ─────────────────────────────────────────
  function generatePythonCode(request, settings) {
    if (!request || !request.url) return '';

    var url = request.url;
    
    // Handle query parameters
    if (request.queryParams) {
      var queryParams = Object.entries(request.queryParams)
        .map(function ([key, value]) { return key + '=' + encodeURIComponent(value); })
        .join('&');
      if (queryParams) {
        url = url.split('?')[0] + '?' + queryParams;
      }
    }

    var headers = request.headers || {};
    
    // Build Python code
    var lines = [
      'import httpx',
      '',
      '# LLM Configuration',
      'llm_base_url = "' + (settings.baseUrl || '') + '"',
      'llm_api_key = "' + (settings.apiKey or 'None') + '"',
      'llm_model_id = "' + (settings.modelId || 'gpt-4') + '"',
      '',
    ];

    lines.push('async with httpx.AsyncClient() as client:');
    
    // Build headers dict
    var headerLines = [];
    Object.entries(headers).forEach(function ([key, value]) {
      if (value !== undefined && key.toLowerCase() !== 'content-length') {
        var escapedValue = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        headerLines.push('    "' + key + '": "' + escapedValue + '",');
      }
    });
    
    var headerDict = headerLines.length > 0 
      ? '{\n' + headerLines.join('\n') + '\n    }'
      : 'None';

    // Get body
    var bodyStr = '';
    if (request.body) {
      try {
        var body = JSON.parse(request.body);
        if (body && Object.keys(body).length > 0) {
          bodyStr = JSON.stringify(body, indent=4);
        }
      } catch (e) {
        bodyStr = "''";
      }
    }

    // Build the request call
    var requestLine = '    response = await client.' + request.method.toLowerCase() + '(';
    
    if (url.length < 60) {
      requestLine += '"' + url.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '",';
    } else {
      requestLine += '\n        "' + url.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '",';
    }

    if (headerDict !== 'None') {
      requestLine += '\n        headers=' + headerDict + ',';
    }

    if (bodyStr && bodyStr !== "''") {
      requestLine += '\n        json=' + bodyStr + ',';
    }

    if (url.length >= 60 || headerDict !== 'None' || (bodyStr && bodyStr !== "''")) {
      requestLine += '\n    )';
    } else {
      requestLine = requestLine.slice(0, -1) + ')';
    }

    lines.push(requestLine);
    lines.push('');
    lines.push('print(response.status_code)');
    lines.push('print(json.dumps(response.json(), indent=2))');

    return lines.join('\n');
  }

  // ── JavaScript Code Generator (fetch) ─────────────────────────────────────
  function generateJavaScriptCode(request, settings) {
    if (!request || !request.url) return '';

    var url = request.url;
    
    // Handle query parameters
    if (request.queryParams) {
      var queryParams = Object.entries(request.queryParams)
        .map(function ([key, value]) { return key + '=' + encodeURIComponent(value); })
        .join('&');
      if (queryParams) {
        url = url.split('?')[0] + '?' + queryParams;
      }
    }

    var headers = request.headers || {};

    // Build fetch code
    var lines = [
      '// LLM Configuration',
      'const llmBaseUrl = "' + (settings.baseUrl || '') + '";',
      'const llmApiKey = "' + (settings.apiKey or 'None') + '";',
      'const llmModelId = "' + (settings.modelId || 'gpt-4') + '";',
      '',
      'async function makeRequest() {',
      '  const response = await fetch("' + url.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '", {',
      '    method: "' + request.method.toUpperCase() + '",',
    ];

    // Add headers
    var hasHeaders = false;
    Object.entries(headers).forEach(function ([key, value]) {
      if (value !== undefined && key.toLowerCase() !== 'content-length') {
        var escapedValue = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        lines.push('    "' + key + '": "' + escapedValue + '",');
        hasHeaders = true;
      }
    });

    // Add body
    if (request.body) {
      try {
        var body = JSON.parse(request.body);
        if (body && Object.keys(body).length > 0) {
          lines.push('    body: JSON.stringify(' + JSON.stringify(body, null, 2) + '),');
        }
      } catch (e) {
        lines.push('    body: "' + String(request.body).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '",');
      }
    }

    lines.push('  });');
    lines.push('');
    lines.push('  const data = await response.json();');
    lines.push('  console.log(response.status, data);');
    lines.push('}');
    lines.push('');
    lines.push('// Call makeRequest() to execute');

    return lines.join('\n');
  }

  // ── Code Export Plugin for Swagger UI ─────────────────────────────────────
  window.CodeExportPlugin = function (system) {
    return {
      components: {
        Operation: function (OriginalComponent) {
          return function (props) {
            var React = system.React;

            // Get original component props
            var getComponent = system.getComponent;
            var getSystem = system.getSystem;

            // Add code export buttons after the try-it-out section
            var OriginalOperation = OriginalComponent || getComponent('Operation');

            return React.createElement(
              "div",
              null,
              React.createElement(OriginalOperation, props),
              React.createElement(CodeExportButtons, { props: props })
            );
          };
        },
      },
    };
  };

  // ── Code Export Buttons Component ─────────────────────────────────────────
  function CodeExportButtonsFactory(system) {
    var React = system.React;

    return class CodeExportButtons extends React.Component {
      constructor(props) {
        super(props);
        this.state = { showPanel: false, activeTab: 'curl' };
        this.generateCurl = this.generateCurl.bind(this);
        this.generatePython = this.generatePython.bind(this);
        this.generateJS = this.generateJS.bind(this);
        this.copyToClipboard = this.copyToClipboard.bind(this);
      }

      generateCurl() {
        var request = this.getRequest();
        var uiState = system.getSystem().store.getState();
        var settings = uiState.llmSettings || {};
        
        return generateCurlFromRequest(request, settings);
      }

      generatePython() {
        var request = this.getRequest();
        var uiState = system.getSystem().store.getState();
        var settings = uiState.llmSettings || {};
        
        return generatePythonCode(request, settings);
      }

      generateJS() {
        var request = this.getRequest();
        var uiState = system.getSystem().store.getState();
        var settings = uiState.llmSettings || {};
        
        return generateJavaScriptCode(request, settings);
      }

      getRequest() {
        // Get current request from the operation
        var props = this.props || {};
        var operation = props.operation || {};
        
        return {
          method: operation.method || 'get',
          url: operation.path || '',
          headers: {},
          body: null,
        };
      }

      copyToClipboard(text) {
        if (!text || !navigator.clipboard) return;
        
        navigator.clipboard.writeText(text).then(function () {
          alert('Copied to clipboard!');
        }).catch(function (err) {
          console.error('Failed to copy:', err);
        });
      }

      render() {
        var React = system.React;

        return React.createElement(
          "div",
          { style: styles.codeExportContainer },
          React.createElement(
            "button",
            {
              onClick: function () { this.setState({ showPanel: !this.state.showPanel }); }.bind(this),
              style: styles.toggleButton
            },
            this.state.showPanel ? "▲ Hide Code" : "▼ Show Code"
          ),
          this.state.showPanel && React.createElement(
            "div",
            { style: styles.codePanel },
            React.createElement(
              "div",
              { style: styles.tabBar },
              ['curl', 'python', 'javascript'].map(function (tab) {
                return React.createElement(
                  "button",
                  {
                    key: tab,
                    onClick: function () { this.setState({ activeTab: tab }); }.bind(this),
                    style: {
                      ...styles.tabButton,
                      backgroundColor: this.state.activeTab === tab ? '#3b82f6' : undefined
                    }
                  },
                  tab.toUpperCase()
                );
              }.bind(this))
            ),
            React.createElement(
              "div",
              { style: styles.codeArea },
              React.createElement("pre", null, this.getCode())
            ),
            React.createElement(
              "button",
              {
                onClick: function () { this.copyToClipboard(this.getCode()); }.bind(this),
                style: styles.copyButton
              },
              "Copy to Clipboard"
            )
          )
        );
      }

      getCode() {
        switch (this.state.activeTab) {
          case 'python': return this.generatePython();
          case 'javascript': return this.generateJavaScript();
          default: return this.generateCurl();
        }
      }

      generateJavaScript() {
        var request = this.getRequest();
        var uiState = system.getSystem().store.getState();
        var settings = uiState.llmSettings || {};
        
        return generateJavaScriptCode(request, settings);
      }
    };
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  var styles = {
    codeExportContainer: {
      marginTop: '20px',
      borderTop: '1px solid #374151',
      paddingTop: '12px',
    },
    toggleButton: {
      background: '#4b5563',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      padding: '6px 12px',
      cursor: 'pointer',
      fontSize: '12px',
    },
    codePanel: {
      marginTop: '12px',
      background: '#1f2937',
      borderRadius: '4px',
      overflow: 'hidden',
    },
    tabBar: {
      display: 'flex',
      borderBottom: '1px solid #374151',
    },
    tabButton: {
      background: '#374151',
      color: '#d1d5db',
      border: 'none',
      padding: '8px 16px',
      cursor: 'pointer',
      fontSize: '12px',
      borderBottom: '2px solid transparent',
    },
    codeArea: {
      padding: '12px',
      overflowX: 'auto',
    },
    copyButton: {
      marginTop: '8px',
      background: '#2563eb',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      padding: '6px 12px',
      cursor: 'pointer',
      fontSize: '12px',
    },
  };

  // ── Plugin Definition ─────────────────────────────────────────────────────
  window.CodeExportPlugin = function (system) {
    return {
      components: {
        CodeExportButtons: CodeExportButtonsFactory(system),
      },
    };
  };

})();
