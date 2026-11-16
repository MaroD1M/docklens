import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { OverviewPage } from "./pages/OverviewPage";
import { EndpointsPage } from "./pages/EndpointsPage";
import { PortsPage } from "./pages/PortsPage";
import { NetworksPage } from "./pages/NetworksPage";
import { TopologyPage } from "./pages/TopologyPage";
import { ToolsPage } from "./pages/ToolsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useDataVersion } from "./data/DataProvider";

export default function App() {
  useDataVersion();

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="endpoints" element={<EndpointsPage />} />
          <Route path="ports" element={<PortsPage />} />
          <Route path="networks" element={<NetworksPage />} />
          <Route path="topology" element={<TopologyPage />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
