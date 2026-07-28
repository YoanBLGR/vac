import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/onest";
import "@fontsource/gloock";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
