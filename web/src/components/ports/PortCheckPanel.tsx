import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Endpoint } from "../../types";
import { primaryIp, sourceLabels, statusLabels } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { HoloCard } from "../ui/HoloCard";
import { SectionHeader } from "../ui/SectionHeader";
import { formatHostPort, type PortProtocol } from "./portUtils";

interface PortCheckPanelProps {
  endpoints: Endpoint[];
}

interface CheckResult {
  occupied: boolean;
  matches: Endpoint[];
  address: string;
}

function validateIp(value: string): string | null {
  if (!value) return null;
  const normalized = value.replace(/^\[/, "").replace(/\]$/, "");
  if (normalized.includes(":")) {
    return /^[0-9a-fA-F:.]+$/.test(normalized) ? null : "IP 格式不正确（IPv4/IPv6）。";
  }
  const parts = normalized.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
    return "IP 格式不正确（IPv4/IPv6）。";
  }
  return null;
}

function endpointIps(endpoint: Endpoint): string[] {
  return [endpoint.ip, ...(endpoint.accessIps?.map((item) => item.ip) ?? [])];
}

export function PortCheckPanel({ endpoints }: PortCheckPanelProps) {
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("8080");
  const [protocol, setProtocol] = useState<PortProtocol>("tcp");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const portNumber = Number(port);
    if (!port.trim() || !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      setError("端口需为 1–65535 的整数。");
      setResult(null);
      return;
    }
    const ipError = validateIp(ip.trim());
    if (ipError) {
      setError(ipError);
      setResult(null);
      return;
    }

    setError("");
    setResult(null);
    setScanning(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const targetIp = ip.trim();
      const portMatches = endpoints.filter(
        (endpoint) => endpoint.protocol === protocol && endpoint.port === portNumber,
      );
      const matches = targetIp
        ? portMatches.filter(
            (endpoint) =>
              endpointIps(endpoint).includes(targetIp) ||
              endpoint.ip === "0.0.0.0" ||
              endpoint.ip === "::",
          )
        : portMatches;
      const match = matches[0];
      const addressIp = targetIp || (match ? primaryIp(match) : "0.0.0.0");
      setResult({
        occupied: matches.length > 0,
        matches,
        address: formatHostPort(addressIp, portNumber),
      });
      setScanning(false);
    }, 480);
  };

  const first = result?.matches[0];
  const services = Array.from(new Set(result?.matches.map((endpoint) => endpoint.service) ?? []));
  const sources = Array.from(new Set(result?.matches.map((endpoint) => sourceLabels[endpoint.source]) ?? []));

  return (
    <HoloCard className="ports-panel" as="section">
      <div className={`ports-check ${scanning ? "is-scanning" : ""}`} aria-busy={scanning}>
        {scanning && <span className="ports-scanbar" aria-hidden="true" />}
        <SectionHeader title="端口检查" />

        <form className="ports-form" onSubmit={submit} noValidate>
          <div className="ports-form-row">
            <label className="ports-field ports-field-grow">
              <span>IP（可选）</span>
              <input
                className="input mono"
                type="text"
                value={ip}
                placeholder="192.168.1.20"
                onChange={(event) => setIp(event.target.value)}
                aria-label="要检查的 IP 地址"
              />
            </label>
            <label className="ports-field ports-field-port">
              <span>端口</span>
              <input
                className="input mono"
                type="number"
                inputMode="numeric"
                min={1}
                max={65535}
                value={port}
                onChange={(event) => setPort(event.target.value)}
                aria-label="要检查的端口"
              />
            </label>
          </div>

          <div className="ports-form-row">
            <span className="ports-field-label">协议</span>
            <div className="segmented" role="group" aria-label="检查协议">
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
            <button type="submit" className="btn btn-primary ports-form-submit" disabled={scanning}>
              {scanning ? "检查中" : "检查占用"}
            </button>
          </div>

          {error && (
            <p className="ports-error" role="alert">
              {error}
            </p>
          )}
        </form>

        <div className="ports-check-result" aria-live="polite">
          {scanning ? (
            <p className="ports-check-scanning">
              正在检查 {ip.trim() ? `${ip.trim()}:` : ":"}
              {port}/{protocol}…
            </p>
          ) : result ? (
            <div className={`ports-result ${result.occupied ? "is-occupied" : "is-free"}`}>
              <div className="ports-result-head">
                <Badge tone={result.occupied ? "red" : "green"} dot>
                  {result.occupied ? "已占用" : "空闲"}
                </Badge>
                <span className="mono">{result.address}</span>
                <span className="ports-result-proto">{protocol.toUpperCase()}</span>
              </div>

              {result.occupied && first ? (
                <>
                  <div className="ports-result-service">
                    {services.join(" / ")}
                    {result.matches.length > 1 && <em>另有 {result.matches.length - 1} 个端点</em>}
                  </div>
                  <div className="ports-result-meta">
                    <span>来源 {sources.join(" / ")}</span>
                    <span>状态 {statusLabels[first.status]}</span>
                    {first.container !== "—" && <span>容器 {first.container}</span>}
                  </div>
                  <div className="ports-result-actions">
                    <CopyButton
                      value={result.address}
                      label="复制地址"
                      variant="solid"
                      toast={`已复制 ${result.address}`}
                    />
                    <CopyButton
                      value={first.service}
                      label="复制服务名"
                      variant="chip"
                      toast={`已复制 ${first.service}`}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="ports-result-free-text">端点数据中未发现占用。</p>
                  <div className="ports-result-actions">
                    <CopyButton
                      value={`${result.address}/${protocol}`}
                      label="复制查询结果"
                      variant="chip"
                      toast={`已复制 ${result.address}/${protocol}`}
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="ports-check-empty">输入端口后检查占用。</p>
          )}
        </div>
      </div>
    </HoloCard>
  );
}
