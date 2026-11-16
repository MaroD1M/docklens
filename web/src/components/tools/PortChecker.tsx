import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, ScanSearch, TriangleAlert } from "lucide-react";
import type { Endpoint } from "../../types";
import { endpoints } from "../../data/mock";
import { endpointAddress, primaryIp, sourceLabels } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { HoloCard } from "../ui/HoloCard";
import { SectionHeader } from "../ui/SectionHeader";

type Protocol = "tcp" | "udp" | "sctp";

interface CheckedQuery {
  ip: string;
  port: number;
  protocol: Protocol;
}

function ipMatches(endpoint: Endpoint, ip: string): boolean {
  if (!ip) return true;
  const candidates = new Set<string>([endpoint.ip, primaryIp(endpoint)]);
  endpoint.accessIps?.forEach((entry) => candidates.add(entry.ip));
  return candidates.has(ip);
}

export function PortChecker() {
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("8080");
  const [protocol, setProtocol] = useState<Protocol>("tcp");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [checked, setChecked] = useState<CheckedQuery | null>(null);
  const [result, setResult] = useState<Endpoint[]>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number(port);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      setError("端口必须是 1–65535 之间的整数。");
      setChecked(null);
      setResult([]);
      return;
    }

    const normalizedIp = ip.trim();
    if (normalizedIp && !/^[a-zA-Z0-9.:-]+$/.test(normalizedIp)) {
      setError("IP 地址格式不正确。");
      setChecked(null);
      setResult([]);
      return;
    }

    setError("");
    setScanning(true);
    setChecked(null);
    setResult([]);
    window.clearTimeout(timer.current);

    const query: CheckedQuery = { ip: normalizedIp, port: parsed, protocol };
    timer.current = window.setTimeout(() => {
      const found = endpoints.filter(
        (endpoint) =>
          endpoint.port === parsed &&
          endpoint.protocol === protocol &&
          ipMatches(endpoint, normalizedIp),
      );
      setResult(found);
      setChecked(query);
      setScanning(false);
    }, 400);
  };

  return (
    <HoloCard className="tools-card">
      <SectionHeader title="端口检查" />
      <form className="tools-form" onSubmit={handleSubmit}>
        <div className="tools-form-grid">
          <label className="tools-field">
            <span>IP</span>
            <input
              className="input"
              type="text"
              value={ip}
              placeholder="留空为全部"
              onChange={(event) => setIp(event.target.value)}
            />
          </label>
          <label className="tools-field">
            <span>端口</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={port}
              placeholder="1–65535"
              aria-invalid={Boolean(error)}
              onChange={(event) => setPort(event.target.value)}
            />
          </label>
          <label className="tools-field">
            <span>协议</span>
            <select
              className="select"
              value={protocol}
              onChange={(event) => setProtocol(event.target.value as Protocol)}
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
              <option value="sctp">SCTP</option>
            </select>
          </label>
          <div className="tools-field tools-field-action">
            <span aria-hidden="true">&nbsp;</span>
            <button type="submit" className="btn btn-primary" disabled={scanning}>
              <ScanSearch size={14} />
              {scanning ? "扫描中" : "检查端口"}
            </button>
          </div>
        </div>
        {error && (
          <p className="tools-error" role="alert">
            <TriangleAlert size={13} />
            {error}
          </p>
        )}
      </form>

      {scanning && (
        <div className="tools-scan" role="status">
          <ScanSearch size={16} className="tools-spinner" />
          扫描 {port || "—"}/{protocol}…
        </div>
      )}

      {!scanning && checked && result.length === 0 && (
        <div className="tools-result is-free">
          <div className="tools-result-head">
            <CheckCircle2 size={17} />
            <strong>端口可用</strong>
            <Badge tone="green" dot>
              未发现占用
            </Badge>
          </div>
          <div className="tools-result-address mono">
            {checked.ip || "192.168.1.20"}:{checked.port}/{checked.protocol}
          </div>
          <p className="tools-hint">仅对照已采集端点。</p>
          <CopyButton
            value={`${checked.ip || "192.168.1.20"}:${checked.port}/${checked.protocol}`}
            label="复制检查结果"
          />
        </div>
      )}

      {!scanning && checked && result.length > 0 && (
        <div className="tools-result is-occupied">
          <div className="tools-result-head">
            <TriangleAlert size={17} />
            <strong>端口已占用</strong>
            <Badge tone="amber" dot>
              {result.length} 处占用
            </Badge>
          </div>
          <div className="tools-result-list">
            {result.map((endpoint) => (
              <div className="tools-result-row" key={endpoint.id}>
                <div>
                  <strong>{endpoint.service}</strong>
                  <span>
                    {sourceLabels[endpoint.source]} · {endpoint.network} ·{" "}
                    {endpoint.container || "宿主机服务"}
                  </span>
                  <span className="mono">{endpointAddress(endpoint)}</span>
                </div>
                <CopyButton
                  value={endpointAddress(endpoint)}
                  label="复制"
                  variant="chip"
                  toast={`已复制 ${endpointAddress(endpoint)}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </HoloCard>
  );
}
