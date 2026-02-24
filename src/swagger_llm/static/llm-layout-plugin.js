// LLM Layout Plugin
// Wraps the standard Swagger UI BaseLayout with tabs for API, Chat, and Settings.

(function () {
  "use strict";

  // Storage key for persisting active tab
  var TAB_STORAGE_KEY = "swagger-llm-active-tab";

  window.LLMLayoutPlugin = function (system) {
    var React = system.React;

    function LLMDocsLayout(props) {
      var BaseLayout = system.getComponent("BaseLayout", true);
      var LLMSettingsPanel = system.getComponent("LLMSettingsPanel", true);
      var ChatPanel = system.getComponent("ChatPanel", true);

      // Get saved tab preference, default to "explorer"
      var savedTab = localStorage.getItem(TAB_STORAGE_KEY) || "explorer";
      var _state = React.useState(savedTab);
      var activeTab = _state[0];
      var setActiveTab = _state[1];

      // Persist tab preference to localStorage
      React.useEffect(function () {
        localStorage.setItem(TAB_STORAGE_KEY, activeTab);
      }, [activeTab]);

      // Tab styles for 3 tabs (theme-aware)
      var tabStyle = function (tab) {
        return {
          background: activeTab === tab ? "var(--theme-primary)" : "var(--theme-secondary)",
          color: activeTab === tab ? "#fff" : "var(--theme-text-secondary)",
          border: "none",
          borderRadius: "4px 4px 0 0",
          padding: "8px 16px",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: activeTab === tab ? "600" : "400",
        };
      };

      return React.createElement(
        "div",
        null,
        // Tab navigation bar
        React.createElement(
          "div",
          {
            style: {
              fontFamily: "'Inter', 'Segoe UI', sans-serif",
              border: "1px solid var(--theme-border-color)",
              borderRadius: "6px 6px 0 0",
              background: "var(--theme-header-bg)",
            }
          },
          React.createElement(
            "div",
            { style: { display: "flex", gap: "2px", padding: "8px 8px 0 8px" } },
            // API Explorer tab
            React.createElement(
              "button",
              { onClick: function () { setActiveTab("explorer"); }, style: tabStyle("explorer") },
              "API Explorer"
            ),
            // Chat tab
            React.createElement(
              "button",
              { onClick: function () { setActiveTab("chat"); }, style: tabStyle("chat") },
              "Chat"
            ),
            // Settings tab
            React.createElement(
              "button",
              { onClick: function () { setActiveTab("settings"); }, style: tabStyle("settings") },
              "Settings"
            )
          )
        ),
        
        // Content area
        React.createElement(
          "div",
          {
            style: {
              border: "1px solid var(--theme-border-color)",
              borderTop: "none",
              borderRadius: "0 0 6px 6px",
              background: "var(--theme-header-bg)",
            }
          },
          // API Explorer tab content
          activeTab === "explorer" ? React.createElement(BaseLayout, props) : null,
          
          // Chat tab content
          activeTab === "chat" ? React.createElement(ChatPanel, null) : null,
          
          // LLM Settings tab content
          activeTab === "settings" ? React.createElement(LLMSettingsPanel, null) : null
        )
      );
    }

    return {
      components: {
        LLMDocsLayout: LLMDocsLayout,
      },
    };
  };
})();
