import { useMemo } from "react";
import type { Endpoint, PortCell } from "../../types";
import { formatPercent } from "../../lib/format";
import { HoloCard } from "../ui/HoloCard";
import {
  findConflicts,
  usedPortsFor,
  type PortProtocol,
  type PortRange,
} from "./portUtils";

interface PortSummaryProps {
  endpoints: Endpoint[];
  portCells: PortCell[];
  udpPorts: PortCell[];
  range: PortRange;
  protocol: PortProtocol;
}

export function PortSummary({ endpoints, portCells, udpPorts, range, protocol }: PortSummaryProps) {
  const data = useMemo(() => {
    const tcp = usedPortsFor("tcp", endpoints, portCells);
    const udp = usedPortsFor("udp", endpoints, portCells, udpPorts);
    const selected = protocol === "tcp" ? tcp : udp;
    const inRange = Array.from(selected).filter((port) => port >= range.start && port <= range.end).length;
    const conflicts = findConflicts(endpoints);
    const tcpEndpoints = endpoints.filter((endpoint) => endpoint.protocol === "tcp").length;
    const udpEndpoints = endpoints.filter((endpoint) => endpoint.protocol === "udp").length;
    return {
      usedTotal: tcp.size + udp.size,
      inRange,
      freeInRange: range.end - range.start + 1 - inRange,
      tcpCount: tcpEndpoints,
      udpCount: udpEndpoints,
      conflicts,
    };
  }, [endpoints, portCells, udpPorts, protocol, range]);

  const conflictText = data.conflicts.length
    ? data.conflicts
        .slice(0, 3)
        .map((item) => `:${item.port}/${item.protocol}`)
        .join(" · ")
    : "无冲突";

  return (
    <div className="ports-summary" aria-label="端口概况">
      <HoloCard className="ports-summary-card" glow="cyan">
        <div className="metric-label">已用</div>
        <div className="metric-value">
          {data.usedTotal}
          <small>个</small>
        </div>
        <div className="metric-foot">
          {data.tcpCount} TCP · {data.udpCount} UDP
        </div>
      </HoloCard>

      <HoloCard className="ports-summary-card" glow="green">
        <div className="metric-label">段内空闲</div>
        <div className="metric-value">
          {data.freeInRange}
          <small>个</small>
        </div>
        <div className="metric-foot">
          {range.start}–{range.end} · {protocol.toUpperCase()}
        </div>
      </HoloCard>

      <HoloCard className="ports-summary-card">
        <div className="metric-label">协议分布</div>
        <div className="metric-value ports-summary-split">
          {data.tcpCount}
          <small>TCP</small>
          <span>/</span>
          {data.udpCount}
          <small>UDP</small>
        </div>
        <div className="metric-foot">
          已用率 {formatPercent(data.inRange / (range.end - range.start + 1))}
        </div>
      </HoloCard>

      <HoloCard className="ports-summary-card" glow={data.conflicts.length ? "danger" : "none"}>
        <div className="metric-label">端口冲突</div>
        <div className={`metric-value ${data.conflicts.length ? "metric-trend-danger" : ""}`}>
          {data.conflicts.length}
          <small>处</small>
        </div>
        <div className={`metric-foot ${data.conflicts.length ? "metric-trend-danger" : ""}`}>{conflictText}</div>
      </HoloCard>
    </div>
  );
}
