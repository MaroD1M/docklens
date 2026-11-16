import { BatchCopyCenter } from "../components/tools/BatchCopyCenter";
import { FreePortFinder } from "../components/tools/FreePortFinder";
import { PortChecker } from "../components/tools/PortChecker";
import "../components/tools/tools.css";

export function ToolsPage() {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">工具</h1>
          <p className="page-subtitle">端口与复制工具</p>
        </div>
      </header>

      <div className="tools-grid">
        <PortChecker />
        <FreePortFinder />
      </div>

      <BatchCopyCenter />
    </div>
  );
}
