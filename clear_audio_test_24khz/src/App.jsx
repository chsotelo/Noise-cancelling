import { useState } from "react";
import SetupScreen from "./components/SetupScreen";
import ConversationScreen from "./components/ConversationScreen";
import ThemeToggle from "./components/ThemeToggle";
import "./App.css";

// Application Flow States
const AppFlow = {
  SETUP: "setup", // Initial screen - mode selection
  CONVERSATION: "conversation", // Recording screen
};

function App() {
  const [currentFlow, setCurrentFlow] = useState(AppFlow.SETUP);
  const [sessionConfig, setSessionConfig] = useState(null);

  const handleContinueToConversation = (config) => {
    setSessionConfig(config);
    setCurrentFlow(AppFlow.CONVERSATION);
  };

  const handleEndConversation = () => {
    setSessionConfig(null);
    setCurrentFlow(AppFlow.SETUP);
  };

  return (
    <div className="app">
      <ThemeToggle />
      {currentFlow === AppFlow.SETUP && (
        <SetupScreen onContinue={handleContinueToConversation} />
      )}

      {currentFlow === AppFlow.CONVERSATION && sessionConfig && (
        <ConversationScreen
          config={sessionConfig}
          onEndConversation={handleEndConversation}
        />
      )}
    </div>
  );
}

export default App;
