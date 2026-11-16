import { useState, type FormEvent } from "react";
import type { Endpoint, PortCell } from "../../types";
import { CopyButton } from "../ui/CopyButton";
import { HoloCard } from "../ui/HoloCard";
import { SectionHeader } from "../ui/SectionHeader";
import { findFreePorts, usedPortsFor, type PortProtocol } from "./portUtils";

interface FreePortFinderProps {
  endpoints: Endpoint[];
  portCells: PortCell[];
  udpPorts: PortCell[];
}

interface ValidationResult {
  start: number;
  end: number;
  count: number;
  error?: string;
}

function validate(startValue: string, endValue: string, countValue: string): ValidationResult {
  const start = Number(startValue);
  const end = Number(endValue);
  const count = Number(countValue);

  if (!startValue.trim() || !endValue.trim() || !countValue.trim()) {
    return { start, end, count, error: "请填写完整。" };
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(count)) {
    return { start, end, count, error: "需为整数。" };
  }
  if (start < 1 || end > 65535 || start > 65535 || end < 1) {
    return { start, end, count, error: "范围 1–65535。" };
  }
  if (start > end) {
    return { start, end, count, error: "起始不能大于结束。" };
  }
  const available = end - start + 1;
  if (count < 1 || count > available) {
    return { start, end, count, error: `数量 1–${available}。` };
  }
  return { start, end, count };
}

export function FreePortFinder({ endpoints, portCells, udpPorts }: FreePortFinderProps) {
  const [start, setStart] = useState("1024");
  const [end, setEnd] = useState("2048");
  const [count, setCount] = useState("5");
  const [protocol, setProtocol] = useState<PortProtocol>("tcp");
  const [results, setResults] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const checked = validate(start, end, count);
    if (checked.error) {
      setError(checked.error);
      setNotice("");
      setResults([]);
      return;
    }

    const used = usedPortsFor(protocol, endpoints, portCells, udpPorts);
    const found = findFreePorts(checked.start, checked.end, checked.count, used);
    setResults(found);
    setError(found.length === 0 ? `范围内无空闲 ${protocol.toUpperCase()} 端口。` : "");
    setNotice(
      found.length > 0 && found.length < checked.count
        ? `仅找到 ${found.length} 个，少于 ${checked.count} 个。`
        : "",
    );
  };

  return (
    <HoloCard className="ports-panel" as="section">
      <SectionHeader title="空闲端口" />

      <form className="ports-form" onSubmit={submit} noValidate>
        <div className="ports-form-row ports-form-row-3">
          <label className="ports-field">
            <span>起始</span>
            <input
              className="input mono"
              type="number"
              inputMode="numeric"
              min={1}
              max={65535}
              value={start}
              onChange={(event) => setStart(event.target.value)}
              aria-label="起始端口"
            />
          </label>
          <label className="ports-field">
            <span>结束</span>
            <input
              className="input mono"
              type="number"
              inputMode="numeric"
              min={1}
              max={65535}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              aria-label="结束端口"
            />
          </label>
          <label className="ports-field">
            <span>数量</span>
            <input
              className="input mono"
              type="number"
              inputMode="numeric"
              min={1}
              value={count}
              onChange={(event) => setCount(event.target.value)}
              aria-label="空闲端口数量"
            />
          </label>
        </div>

        <div className="ports-form-row">
          <span className="ports-field-label">协议</span>
          <div className="segmented" role="group" aria-label="查找协议">
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
          <button type="submit" className="btn btn-primary ports-form-submit">
            查找
          </button>
        </div>

        {error && (
          <p className="ports-error" role="alert">
            {error}
          </p>
        )}
        {notice && <p className="ports-notice">{notice}</p>}
      </form>

      <div className="ports-finder-results" aria-live="polite">
        {results.length > 0 ? (
          <>
            <div className="ports-finder-results-head">
              <span>
                {results.length} 个空闲端口
                <em>{protocol.toUpperCase()}</em>
              </span>
              <CopyButton
                value={results.join(",")}
                label="复制全部"
                variant="ghost"
                title="复制全部空闲端口"
                toast={`已复制 ${results.length} 个端口`}
              />
            </div>
            <div className="ports-chips">
              {results.map((port) => (
                <CopyButton
                  key={port}
                  value={String(port)}
                  label={String(port)}
                  variant="chip"
                  className="ports-port-chip"
                  title={`复制端口 ${port}`}
                  toast={`已复制端口 ${port}`}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="ports-finder-empty">点击端口复制。</p>
        )}
      </div>
    </HoloCard>
  );
}
