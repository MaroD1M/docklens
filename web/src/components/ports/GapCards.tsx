import { useMemo } from "react";
import type { Endpoint, PortCell } from "../../types";
import { CopyButton } from "../ui/CopyButton";
import { HoloCard } from "../ui/HoloCard";
import { getFreeRanges, usedPortsFor, type PortProtocol, type PortRange } from "./portUtils";

interface GapCardsProps {
  endpoints: Endpoint[];
  portCells: PortCell[];
  udpPorts: PortCell[];
  range: PortRange;
  protocol: PortProtocol;
}

export function GapCards({ endpoints, portCells, udpPorts, range, protocol }: GapCardsProps) {
  const ranges = useMemo(() => {
    const used = usedPortsFor(protocol, endpoints, portCells, udpPorts);
    return getFreeRanges(range.start, range.end, used)
      .sort((a, b) => b.count - a.count || a.start - b.start)
      .slice(0, 6);
  }, [endpoints, portCells, udpPorts, range, protocol]);

  return (
    <HoloCard className="ports-gaps" as="section">
      <div className="ports-gaps-head">
        <div>
          <h2 className="section-title">空闲端口段</h2>
          <p className="section-subtitle">
            {range.start}–{range.end} · {protocol.toUpperCase()}
          </p>
        </div>
        <span className="ports-gaps-count">{ranges.length ? `${ranges.length} 段` : "无空闲段"}</span>
      </div>

      {ranges.length === 0 ? (
        <p className="ports-gaps-empty">当前段无空闲端口。</p>
      ) : (
        <div className="ports-gaps-grid">
          {ranges.map((gap) => (
            <div key={`${gap.start}-${gap.end}`} className="ports-gap-card">
              <div className="ports-gap-main">
                <span className="ports-gap-range mono">
                  {gap.start}–{gap.end}
                </span>
                <span className="ports-gap-size">{gap.count} 个端口</span>
              </div>
              <CopyButton
                value={`${gap.start}-${gap.end}`}
                label="复制"
                variant="chip"
                title={`复制空闲段 ${gap.start}-${gap.end}`}
                toast={`已复制空闲段 ${gap.start}-${gap.end}`}
              />
            </div>
          ))}
        </div>
      )}
    </HoloCard>
  );
}
