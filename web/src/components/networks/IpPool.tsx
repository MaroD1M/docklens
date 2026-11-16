import type { NetworkInfo } from "../../types";
import { formatPercent } from "../../lib/format";
import { ProgressBar } from "../ui/ProgressBar";
import { ipKindLabels, usableHosts } from "./networkUtils";

type UsedIp = NetworkInfo["usedIps"][number];
type PoolState = "gateway" | "container" | "host" | "reserved" | "free";

interface IpPoolProps {
  network: NetworkInfo;
}

const poolLabels: Record<PoolState, string> = {
  gateway: "网关",
  container: "容器",
  host: "宿主机",
  reserved: "保留",
  free: "空闲",
};

function poolState(ip: string, network: NetworkInfo, entries: UsedIp[]): PoolState {
  if (ip === network.gateway) return "gateway";
  if (entries.some((entry) => entry.kind === "host")) return "host";
  if (entries.some((entry) => entry.kind === "container")) return "container";
  if (entries.length > 0) return "reserved";
  return "free";
}

export function IpPool({ network }: IpPoolProps) {
  const hosts = usableHosts(network.subnet);
  const utilizationTone = network.utilization >= 0.8 ? "red" : network.utilization >= 0.5 ? "amber" : "cyan";
  const percent = formatPercent(network.utilization);

  if (network.totalCount > 254 || hosts.length === 0) {
    const ringPercent = Math.max(network.utilization * 100, 0.6);
    return (
      <div className="net-large-pool">
        <div
          className="net-ring"
          style={{
            background: `conic-gradient(var(--hologram) 0 ${ringPercent}%, rgba(143, 166, 191, 0.14) ${ringPercent}% 100%)`,
          }}
          role="img"
          aria-label={`${network.name} 利用率 ${percent}`}
        >
          <div className="net-ring-inner">
            <strong>{percent}</strong>
            <span>利用率</span>
          </div>
        </div>
        <div className="net-large-copy">
          <strong>大网段</strong>
          <p>
            {network.subnet} · {network.totalCount.toLocaleString("zh-CN")} 个地址 · 仅列已用 IP。
          </p>
          <div className="net-large-stats">
            <span>已用 {network.usedCount.toLocaleString("zh-CN")}</span>
            <span>
              空闲 {Math.max(network.totalCount - network.usedCount, 0).toLocaleString("zh-CN")}
            </span>
          </div>
          <ProgressBar value={network.utilization} tone={utilizationTone} label={percent} />
        </div>
      </div>
    );
  }

  const grouped = new Map<string, UsedIp[]>();
  for (const entry of network.usedIps) {
    const list = grouped.get(entry.ip);
    if (list) {
      list.push(entry);
    } else {
      grouped.set(entry.ip, [entry]);
    }
  }

  return (
    <div className="net-pool">
      <div className="net-pool-head">
        <div>
          <strong>IP 地址池</strong>
          <p>
            {network.subnet} · {hosts.length} 可用 · 已用 {network.usedCount} · 空闲{" "}
            {Math.max(network.totalCount - network.usedCount, 0)}
          </p>
        </div>
        <div className="net-pool-legend" aria-label="IP 地址状态图例">
          {(["gateway", "container", "host", "reserved", "free"] as PoolState[]).map((state) => (
            <span key={state} className="net-legend-item">
              <i className={`net-ip-swatch is-${state}`} aria-hidden="true" />
              {poolLabels[state]}
            </span>
          ))}
        </div>
      </div>

      <div
        className="net-ip-pool"
        role="img"
        aria-label={`${network.name} 的 IP 地址池，共 ${hosts.length} 个地址`}
      >
        {hosts.map((ip) => {
          const entries = grouped.get(ip) ?? [];
          const state = poolState(ip, network, entries);
          const detail = entries.length
            ? entries
                .map((entry) => `${ipKindLabels[entry.kind]}${entry.container ? ` ${entry.container}` : ""}`)
                .join(" / ")
            : "空闲";
          return (
            <span
              key={ip}
              className={`net-ip-cell is-${state}`}
              title={`${ip} · ${detail}`}
              aria-hidden="true"
            />
          );
        })}
      </div>
    </div>
  );
}
