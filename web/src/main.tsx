import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DataProvider } from "./data/DataProvider";
import "./styles/global.css";

try {
  const raw = window.localStorage.getItem("docklens.settings.v1");
  if (raw) {
    const stored = JSON.parse(raw) as { theme?: string; animations?: boolean; density?: string };
    if (stored.theme === "light") document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.motion = stored.animations === false ? "off" : "on";
    document.documentElement.dataset.density = stored.density === "compact" ? "compact" : "comfortable";
  }
} catch {
  document.documentElement.dataset.theme = "dark";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DataProvider>
      <App />
    </DataProvider>
  </StrictMode>,
);
