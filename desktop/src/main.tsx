import React from "react";
import ReactDOM from "react-dom/client";

// Import the CSS directly - this will be processed by Vite
import "./app/globals.css";
import App from "./app";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
