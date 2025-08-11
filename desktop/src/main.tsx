import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { attachConsole } from "@tauri-apps/plugin-log";
import { initializeFetchInterceptor } from "./utils/network-interceptor";

// Configure Monaco Editor workers before any components load
import "./monaco-workers";

// Import the CSS directly - this will be processed by Vite
import "./app/globals.css";
import App from "./app";

// Initialize network error interceptor
initializeFetchInterceptor();

// Attach Rust console to forward logs to DevTools
(async () => {
  await attachConsole();
})();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
