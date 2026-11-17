import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { endpoints, portCells, udpPorts } from "../data/mock";
import { useDataVersion } from "../data/DataProvider";
import { findPortConflicts } from "../lib/conflicts";
import { CopyButton } from "../components/ui/CopyButton";
import { HoloCard } from "../components/ui/HoloCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { PortSummary } from "../components/ports/PortSummary";
import { PortConflicts } from "../components/ports/PortConflicts";
import { PortMatrix } from "../components/ports/PortMatrix";
import { GapCards } from "../components/ports/GapCards";
import { FreePortFinder } from "../components/ports/FreePortFinder";
import { PortCheckPanel } from "../components/ports/PortCheckPanel";
import {
  MAX_PORT,
  MIN_PORT,
  PORT_RANGES,
  createWindow,
  shiftWindow,
  windowForPort,
  type PortProtocol,
} from "../components/ports/portUtils";
import "../components/ports/ports.css";

export function PortsPage() {
  const navigate = useNavigate();
  const dataVersion = useDataVersion();
  const [windowStart, setWindowStart] = useState(MIN_PORT);
  const [startInput, setStartInput] = useState(String(MIN_PORT));
  const [protocol, setProtocol] = useState<PortProtocol>("tcp");
  const [focusPort, setFocusPort] = useState<number | null>(null);
  const range = useMemo(() => createWindow(windowStart), [windowStart]);
  const conflicts = useMemo(() => findPortConflicts(endpoints), [dataVersion, endpoints]);

  const applyStart = (value: number) => {
    const next = createWindow(value);
    setWindowStart(next.start);
    setStartInput(String(next.start));
    setFocusPort(null);
  };

  const handleStartChange = (value: string) => {
    setStartInput(value);
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= MIN_PORT && parsed <= MAX_PORT) {
      setWindowStart(createWindow(parsed).start);
      setFocusPort(null);
    }
  };

  const handleStartSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(startInput);
    applyStart(Number.isFinite(parsed) && startInput.trim() ? parsed : range.start);
  };

  const handleStartBlur = () => {
    const parsed = Number(startInput);
    if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
      setStartInput(String(range.start));
    }
  };

  const moveWindow = (direction: -1 | 1) => {
    const next = shiftWindow(range.start, direction);
    setWindowStart(next.start);
    setStartInput(String(next.start));
    setFocusPort(null);
  };

  const jumpToPort = (port: number) => {
    const next = windowForPort(port);
    setWindowStart(next.start);
    setStartInput(String(next.start));
    setFocusPort(port);
  };

  const conflictsInRange = conflicts.filter(
    (conflict) => conflict.port >= range.start && conflict.port <= range.end,
  );
  const canPrev = range.start > MIN_PORT;
  const canNext = range.end < MAX_PORT;

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
        conflicts={conflicts}
      />

      <div className="ports-workspace">
        <div className="ports-main">
          <PortConflicts conflicts={conflicts} onJump={jumpToPort} />

          <HoloCard className="ports-matrix-card" as="section">
            <SectionHeader
              eyebrow={`${range.start}–${range.end} · ${protocol.toUpperCase()}`}
              title="端口矩阵"
              subtitle="固定 256 端口窗口 · 红色格子为冲突"
              action={
                <div className="segmented" role="group" aria-label="选择端口协议">
                  {(["tcp", "udp"] as PortProtocol[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={protocol === item ? "is-active" : ""}
                      aria-pressed={protocol === item}
                      onClick={() => {
                        setProtocol(item);
                        setFocusPort(null);
                      }}
                    >
                      {item.toUpperCase()}
                    </button>
                  ))}
                </div>
              }
            />

            <div className="ports-range-toolbar">
              <div className="ports-window-nav">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => moveWindow(-1)}
                  disabled={!canPrev}
                  aria-label="上一个 256 端口窗口"
                >
                  上一窗
                </button>
                <form className="ports-window-jump" onSubmit={handleStartSubmit}>
                  <label>
                    <span>起始端口</span>
                    <input
                      className="input mono"
                      type="number"
                      inputMode="numeric"
                      min={MIN_PORT}
                      max={MAX_PORT}
                      value={startInput}
                      onChange={(event) => handleStartChange(event.target.value)}
                      onBlur={handleStartBlur}
                      aria-label="跳转到起始端口"
                    />
                  </label>
                  <button type="submit" className="btn btn-sm btn-primary">
                    跳转
                  </button>
                </form>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => moveWindow(1)}
                  disabled={!canNext}
                  aria-label="下一个 256 端口窗口"
                >
                  下一窗
                </button>
              </div>

              <div className="ports-window-readout" aria-live="polite">
                <span className="mono">
                  {range.start}–{range.end}
                </span>
                <span>共 {range.end - range.start + 1} 个端口</span>
                {conflictsInRange.length > 0 && (
                  <strong>{conflictsInRange.length} 处冲突</strong>
                )}
              </div>
            </div>

            <div className="ports-presets">
              <div className="segmented" role="group" aria-label="选择端口段预设">
                {PORT_RANGES.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={range.start === item.start ? "is-active" : ""}
                    aria-pressed={range.start === item.start}
                    onClick={() => applyStart(item.start)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="ports-range-hint">可输入 1–65535 的任意起始端口</span>
            </div>

            <PortMatrix
              endpoints={endpoints}
              portCells={portCells}
              udpPorts={udpPorts}
              protocol={protocol}
              start={range.start}
              end={range.end}
              focusPort={focusPort}
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
