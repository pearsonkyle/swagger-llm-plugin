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
      var WorkflowPanel = system.getComponent("WorkflowPanel", true);

      // Get saved tab preference, default to "api"
      var savedTab = localStorage.getItem(TAB_STORAGE_KEY) || "api";
      var _state = React.useState(savedTab);
      var activeTab = _state[0];
      var setActiveTab = _state[1];

      // Listen for external tab change requests (from other plugins)
      React.useEffect(function () {
        var handleStorageChange = function(e) {
          if (e.key === TAB_STORAGE_KEY && e.newValue) {
            setActiveTab(e.newValue);
          }
        };

        window.addEventListener('storage', handleStorageChange);
        return function() {
          window.removeEventListener('storage', handleStorageChange);
        };
      }, []);

      // Expose direct tab-switch function for same-page use
      window.llmSwitchTab = function(tab) { setActiveTab(tab); };

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

      // Content area style - full height for chat, settings, and workflow
      var isContained = activeTab === "chat" || activeTab === "settings" || activeTab === "workflow";
      var contentStyle = {
        border: "1px solid var(--theme-border-color)",
        borderTop: "none",
        borderRadius: "0 0 6px 6px",
        background: "var(--theme-header-bg)",
        height: isContained ? "calc(100vh - 120px)" : "auto",
        minHeight: isContained ? "400px" : "auto",
        overflow: isContained ? (activeTab === "chat" ? "hidden" : "auto") : "auto",
        flex: isContained ? "none" : "1 1 auto",
        overscrollBehavior: isContained ? "contain" : "auto",
        WebkitOverflowScrolling: "touch",
      };

      return React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", height: isContained ? "100%" : "auto" } },
        // Tab navigation bar
        React.createElement(
          "div",
          {
            style: {
              fontFamily: "'Inter', 'Segoe UI', sans-serif",
              border: "1px solid var(--theme-border-color)",
              borderRadius: "6px 6px 0 0",
              background: "var(--theme-header-bg)",
              flexShrink: 0,
            }
          },
          React.createElement(
            "div",
            { style: { display: "flex", gap: "2px", padding: "8px 8px 0 8px" } },
            // API tab
            React.createElement(
              "button",
              { onClick: function () { setActiveTab("api"); }, style: tabStyle("api") },
              "API"
            ),
            // Chat tab
            React.createElement(
              "button",
              { onClick: function () { setActiveTab("chat"); }, style: tabStyle("chat") },
              "Chat"
            ),
            // Workflow tab
            React.createElement(
              "button",
              { onClick: function () { setActiveTab("workflow"); }, style: tabStyle("workflow") },
              "Workflow"
            ),
            // Settings tab
            React.createElement(
              "button",
              { onClick: function () { setActiveTab("settings"); }, style: tabStyle("settings") },
              "Settings"
            )
          )
        ),
        
        // Content area - use dynamic contentStyle for proper chat height
        React.createElement(
          "div",
          { style: contentStyle },
          // API api tab content
          activeTab === "api" ? React.createElement(BaseLayout, props) : null,
          
          // Chat tab content
          activeTab === "chat" ? React.createElement(ChatPanel, null) : null,
          
          // Workflow tab content
          activeTab === "workflow" ? React.createElement(WorkflowPanel, null) : null,

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
