// LLM Layout Plugin
// Wraps the standard Swagger UI BaseLayout with the LLMSettingsPanel and ChatPanel.

(function () {
  "use strict";

  window.LLMLayoutPlugin = function (system) {
    var React = system.React;

    function LLMDocsLayout(props) {
      var BaseLayout = system.getComponent("BaseLayout", true);
      var LLMSettingsPanel = system.getComponent("LLMSettingsPanel", true);
      var ChatPanel = system.getComponent("ChatPanel", true);

      var _state = React.useState("settings");
      var activeTab = _state[0];
      var setActiveTab = _state[1];

      var tabStyle = function (tab) {
        return {
          background: activeTab === tab ? "#2563eb" : "#374151",
          color: activeTab === tab ? "#fff" : "#9ca3af",
          border: "none",
          borderRadius: "4px 4px 0 0",
          padding: "8px 20px",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: activeTab === tab ? "600" : "400",
        };
      };

      return React.createElement(
        "div",
        null,
        React.createElement(LLMSettingsPanel, null),
        React.createElement(
          "div",
          {
            style: {
              fontFamily: "'Inter', 'Segoe UI', sans-serif",
              border: "1px solid #374151",
              borderRadius: "6px",
              margin: "0 0 16px 0",
              overflow: "hidden",
              background: "#111827",
            }
          },
          React.createElement(
            "div",
            { style: { display: "flex", gap: "2px", padding: "8px 8px 0 8px" } },
            React.createElement(
              "button",
              { onClick: function () { setActiveTab("settings"); }, style: tabStyle("settings") },
              "API Explorer"
            ),
            React.createElement(
              "button",
              { onClick: function () { setActiveTab("chat"); }, style: tabStyle("chat") },
              "Chat"
            )
          ),
          activeTab === "chat"
            ? React.createElement(ChatPanel, null)
            : null
        ),
        activeTab === "settings"
          ? React.createElement(BaseLayout, props)
          : null
      );
    }

    return {
      components: {
        LLMDocsLayout: LLMDocsLayout,
      },
    };
  };
})();
