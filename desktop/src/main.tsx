import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { initializeFetchInterceptor } from "./utils/network-interceptor";

// Configure Monaco Editor workers before any components load
import "./monaco-workers";

// Import the CSS directly - this will be processed by Vite
import "./app/globals.css";
import App from "./app";

// Initialize network error interceptor
initializeFetchInterceptor();

// Initialize simple performance logging
(async () => {
  // Initialize React performance profiler
  if (import.meta.env.DEV) {
    const { initReactProfiler } = await import("./utils/react-performance-profiler");
    initReactProfiler();
  }
})();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
