import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Endpoint, PortCell } from "../../types";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import {
  buildPortSlots,
  portStateLabels,
  type PortProtocol,
  type PortSlot,
  type PortState,
} from "./portUtils";

interface PortMatrixProps {
  endpoints: Endpoint[];
  portCells: PortCell[];
  udpPorts: PortCell[];
  protocol: PortProtocol;
  start: number;
  end: number;
  focusPort?: number | null;
}

const stateTone: Record<PortState, "cyan" | "red" | "muted" | "amber" | "green" | "violet"> = {
  used: "cyan",
  conflict: "red",
  hidden: "muted",
  inferred: "amber",
  reserved: "violet",
  free: "green",
};

const legendStates: PortState[] = ["used", "conflict", "hidden", "inferred", "reserved", "free"];

export function PortMatrix({
  endpoints,
  portCells,
  udpPorts,
  protocol,
  start,
  end,
  focusPort,
}: PortMatrixProps) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<PortSlot | null>(null);
  const [selected, setSelected] = useState<PortSlot | null>(null);

  const slots = useMemo(
    () => buildPortSlots(protocol, start, end, endpoints, portCells, udpPorts),
    [protocol, start, end, endpoints, portCells, udpPorts],
  );
  const conflictCount = slots.filter((slot) => slot.state === "conflict").length;

  useEffect(() => {
    setHovered(null);
    const focused = focusPort != null ? slots.find((slot) => slot.port === focusPort) : null;
    setSelected(focused ?? slots.find((slot) => slot.state !== "free") ?? null);
  }, [slots, focusPort]);

  const active = hovered ?? selected;

  const handleClick = (slot: PortSlot) => {
    setSelected(slot);
    if (slot.state !== "free") {
      navigate(`/endpoints?q=:${slot.port}`);
    }
  };

  return (
    <div className="ports-matrix-wrap">
      <div className="ports-matrix-top">
        <div className="ports-scale">
          {start}–{end}
          <span>
            · 共 {slots.length} 个端口 · 16 列
            {conflictCount > 0 ? ` · ${conflictCount} 处冲突` : ""}
          </span>
        </div>
        <div className="ports-legend" aria-label="端口状态图例">
          {legendStates.map((state) => (
            <span key={state} className="ports-legend-item">
              <i className={`ports-swatch is-${state}`} aria-hidden="true" />
              {portStateLabels[state]}
            </span>
          ))}
        </div>
      </div>

      <div className="ports-matrix" role="group" aria-label={`${start} 到 ${end} 的 ${protocol.toUpperCase()} 端口矩阵`}>
        {slots.map((slot) => {
          const serviceText = slot.services.length ? slot.services.join(" / ") : "空闲";
          const label = `${slot.port}/${slot.protocol} · ${portStateLabels[slot.state]} · ${serviceText}`;
          return (
            <button
              key={slot.port}
              type="button"
              className={`ports-cell is-${slot.state} ${selected?.port === slot.port ? "is-selected" : ""}`}
              title={label}
              aria-label={label}
              aria-pressed={selected?.port === slot.port}
              onMouseEnter={() => setHovered(slot)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(slot)}
              onBlur={() => setHovered(null)}
              onClick={() => handleClick(slot)}
            >
              <span>{slot.port}</span>
            </button>
          );
        })}
      </div>

      <div className={`ports-info ${active ? "" : "is-empty"}`} aria-live="polite">
        {active ? (
          <>
            <div className="ports-info-head">
              <div>
                <div className="ports-info-port mono">
                  {active.port}
                  <span>/{active.protocol}</span>
                </div>
                <div className="ports-info-service">
                  {active.services.length ? active.services.join(" / ") : "空闲"}
                </div>
              </div>
              <Badge tone={stateTone[active.state]} dot>
                {portStateLabels[active.state]}
              </Badge>
            </div>
            <div className="ports-info-meta">
              <span>{active.protocol.toUpperCase()}</span>
              {active.endpoints.length > 0 && <span>{active.endpoints.length} 端点</span>}
            </div>
            <div className="ports-info-actions">
              <CopyButton
                value={`${active.port}/${active.protocol}`}
                label="复制端口"
                variant="chip"
                toast={`已复制 ${active.port}/${active.protocol}`}
              />
              {active.endpoints[0] && (
                <CopyButton
                  value={active.endpoints[0].service}
                  label="复制服务名"
                  variant="chip"
                  toast={`已复制 ${active.endpoints[0].service}`}
                />
              )}
            </div>
          </>
        ) : (
          <span>悬停查看端口详情。</span>
        )}
      </div>
    </div>
  );
}
