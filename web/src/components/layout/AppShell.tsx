import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ToastProvider } from "../ui/Toast";

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="app-bg" aria-hidden="true" />
      <div className="app-shell">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="main-shell">
          <TopBar onMenu={() => setNavOpen(true)} />
          <main className="main-content">
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
