import type { NetworkInfo } from "../../types";
import { formatPercent } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { HoloCard } from "../ui/HoloCard";
import { ProgressBar } from "../ui/ProgressBar";

type BadgeTone = "cyan" | "blue" | "green" | "amber" | "red" | "muted" | "violet";

interface NetworkCardProps {
  network: NetworkInfo;
  selected: boolean;
  onSelect: () => void;
}

function driverTone(driver: string): BadgeTone {
  if (driver === "bridge") return "cyan";
  if (driver === "macvlan") return "violet";
  if (driver === "host") return "amber";
  if (driver === "overlay") return "blue";
  return "muted";
}

function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

export function NetworkCard({ network, selected, onSelect }: NetworkCardProps) {
  const free = Math.max(network.totalCount - network.usedCount, 0);
  const tone = network.utilization >= 0.8 ? "red" : network.utilization >= 0.5 ? "amber" : "cyan";

  return (
    <HoloCard
      className={`net-card ${selected ? "is-selected" : ""}`}
      glow={selected ? "cyan" : network.warning ? "danger" : "none"}
      interactive
      as="article"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      ariaPressed={selected}
      ariaLabel={`${network.name}，${selected ? "当前网络" : "点击选择"}`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="net-card-head">
        <div className="net-card-name">
          <strong title={network.name}>{network.name}</strong>
          <span>{network.scope}</span>
        </div>
        <Badge tone={driverTone(network.driver)} dot>
          {network.driver}
        </Badge>
      </div>

      <div className="net-card-flags">
        {selected && <Badge tone="cyan" dot>当前</Badge>}
        {network.internal && <Badge tone="amber">内部网络</Badge>}
        {network.warning && <Badge tone="red">子网重叠</Badge>}
        {network.ipv6 && <Badge tone="blue">IPv6</Badge>}
      </div>

      <div className="net-card-cidr">
        <div>
          <span>子网</span>
          <code>{network.subnet}</code>
        </div>
        <CopyButton
          value={network.subnet}
          label="复制"
          variant="chip"
          iconOnly
          title={`复制 ${network.name} CIDR`}
          toast={`已复制 ${network.subnet}`}
        />
      </div>

      <div className="net-card-gateway">
        <span>网关</span>
        <code>{network.gateway}</code>
      </div>

      <div className="net-card-stats">
        <div>
          <span>容器</span>
          <strong>{formatNumber(network.containerCount)}</strong>
        </div>
        <div>
          <span>已用</span>
          <strong>{formatNumber(network.usedCount)}</strong>
        </div>
        <div>
          <span>空闲</span>
          <strong>{formatNumber(free)}</strong>
        </div>
      </div>

      <div className="net-card-progress">
        <div className="net-card-progress-head">
          <span>利用率</span>
          <span className="mono">{formatPercent(network.utilization)}</span>
        </div>
        <ProgressBar value={network.utilization} tone={tone} />
      </div>
    </HoloCard>
  );
}
