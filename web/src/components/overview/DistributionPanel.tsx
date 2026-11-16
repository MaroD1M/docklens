import type { Endpoint, NetworkInfo } from "../../types";
import { HoloCard } from "../ui/HoloCard";

interface DistributionPanelProps {
  endpoints: Endpoint[];
  networks: NetworkInfo[];
}

const protocolKeys = ["tcp", "udp", "sctp"] as const;

const protocolColors: Record<(typeof protocolKeys)[number], string> = {
  tcp: "var(--hologram)",
  udp: "var(--plasma)",
  sctp: "var(--violet)",
};

const barTones = ["cyan", "blue", "green", "amber", "violet"];

export function DistributionPanel({ endpoints, networks }: DistributionPanelProps) {
  const total = endpoints.length;
  const protocols = protocolKeys
    .map((protocol) => ({
      protocol,
      count: endpoints.filter((endpoint) => endpoint.protocol === protocol).length,
      color: protocolColors[protocol],
    }))
    .filter((item) => item.count > 0);

  const segments: string[] = [];
  let cursor = 0;
  for (const item of protocols) {
    const start = cursor;
    cursor += (item.count / Math.max(total, 1)) * 100;
    segments.push(`${item.color} ${start}% ${cursor}%`);
  }

  const ringStyle =
    segments.length > 0
      ? { background: `conic-gradient(${segments.join(", ")})` }
      : { background: "rgba(143, 166, 191, 0.14)" };

  const networkRows = networks
    .map((network, index) => ({
      name: network.name,
      count: endpoints.filter((endpoint) => endpoint.network === network.name).length,
      warning: Boolean(network.warning),
      tone: barTones[index % barTones.length],
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const maxCount = Math.max(...networkRows.map((item) => item.count), 1);

  return (
    <HoloCard className="ov-dist-card">
      <div className="ov-panel-head">
        <div>
          <h2 className="ov-panel-title" title="按已登记端点数量统计">
            协议 / 网络分布
          </h2>
        </div>
        <div className="ov-dist-total">
          <strong className="mono">{total}</strong>
          <span>端点</span>
        </div>
      </div>

      <div className="ov-dist-block">
        <div className="ov-dist-label">
          <span>协议分布</span>
          <span className="mono">{protocols.length} 类</span>
        </div>
        <div className="ov-ring-row">
          <div
            className="ov-ring"
            style={ringStyle}
            role="img"
            aria-label={`协议分布：${protocols
              .map((item) => `${item.protocol.toUpperCase()} ${item.count} 个`)
              .join("，")}`}
          >
            <div className="ov-ring-center">
              <strong className="mono">{total}</strong>
              <span>端点</span>
            </div>
          </div>
          <div className="ov-protocol-list">
            {protocols.map((item) => (
              <div key={item.protocol} className="ov-protocol-row">
                <span className="ov-legend-dot" style={{ background: item.color }} />
                <span className="ov-protocol-name">{item.protocol.toUpperCase()}</span>
                <span className="ov-protocol-count mono">{item.count}</span>
                <span className="ov-protocol-pct mono">
                  {Math.round((item.count / Math.max(total, 1)) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ov-dist-block">
        <div className="ov-dist-label">
          <span>网络分布</span>
          <span className="mono">Top {networkRows.length}</span>
        </div>
        <div className="ov-bar-list">
          {networkRows.map((item) => (
            <div key={item.name} className="ov-bar-row">
              <div className="ov-bar-head">
                <span className="ov-bar-name">
                  {item.name}
                  {item.warning && <span className="ov-bar-warning">子网重叠</span>}
                </span>
                <span className="mono">{item.count}</span>
              </div>
              <div className="ov-bar-track">
                <span
                  className={`ov-bar-fill ov-bar-fill--${item.tone}`}
                  style={{ width: `${Math.max(6, (item.count / maxCount) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </HoloCard>
  );
}
