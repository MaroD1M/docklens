import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { endpoints, portCells, udpPorts } from "../data/mock";
import { CopyButton } from "../components/ui/CopyButton";
import { HoloCard } from "../components/ui/HoloCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { PortSummary } from "../components/ports/PortSummary";
import { PortMatrix } from "../components/ports/PortMatrix";
import { GapCards } from "../components/ports/GapCards";
import { FreePortFinder } from "../components/ports/FreePortFinder";
import { PortCheckPanel } from "../components/ports/PortCheckPanel";
import { PORT_RANGES, type PortProtocol } from "../components/ports/portUtils";
import "../components/ports/ports.css";

export function PortsPage() {
  const navigate = useNavigate();
  const [rangeIndex, setRangeIndex] = useState(0);
  const [protocol, setProtocol] = useState<PortProtocol>("tcp");
  const range = PORT_RANGES[rangeIndex];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">端口</h1>
          <p className="page-subtitle">占用、冲突与空闲范围</p>
        </div>
        <div className="page-actions">
          <CopyButton
            value={`${range.start}-${range.end}`}
            label="复制端口段"
            variant="solid"
            title="复制当前端口段"
            toast={`已复制端口段 ${range.start}-${range.end}`}
          />
          <button type="button" className="btn" onClick={() => navigate("/endpoints")}>
            端点列表
          </button>
        </div>
      </header>

      <PortSummary
        endpoints={endpoints}
        portCells={portCells}
        udpPorts={udpPorts}
        range={range}
        protocol={protocol}
      />

      <div className="ports-workspace">
        <div className="ports-main">
          <HoloCard className="ports-matrix-card" as="section">
            <SectionHeader
              eyebrow={`${range.start}–${range.end} · ${protocol.toUpperCase()}`}
              title="端口矩阵"
              action={
                <div className="ports-controls">
                  <div className="segmented" role="group" aria-label="选择端口段">
                    {PORT_RANGES.map((item, index) => (
                      <button
                        key={item.label}
                        type="button"
                        className={index === rangeIndex ? "is-active" : ""}
                        aria-pressed={index === rangeIndex}
                        onClick={() => setRangeIndex(index)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="segmented" role="group" aria-label="选择端口协议">
                    {(["tcp", "udp"] as PortProtocol[]).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={protocol === item ? "is-active" : ""}
                        aria-pressed={protocol === item}
                        onClick={() => setProtocol(item)}
                      >
                        {item.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              }
            />
            <PortMatrix
              endpoints={endpoints}
              portCells={portCells}
              udpPorts={udpPorts}
              protocol={protocol}
              start={range.start}
              end={range.end}
            />
          </HoloCard>

          <GapCards
            endpoints={endpoints}
            portCells={portCells}
            udpPorts={udpPorts}
            range={range}
            protocol={protocol}
          />
        </div>

        <aside className="ports-side" aria-label="端口工具">
          <FreePortFinder endpoints={endpoints} portCells={portCells} udpPorts={udpPorts} />
          <PortCheckPanel endpoints={endpoints} />
        </aside>
      </div>
    </div>
  );
}
