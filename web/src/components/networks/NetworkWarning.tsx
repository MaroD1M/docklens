import type { NetworkInfo } from "../../types";
import { TriangleAlert } from "lucide-react";
import { Badge } from "../ui/Badge";
import { overlappingNetworks, relationLabel, type CidrRelation } from "./networkUtils";

interface NetworkWarningProps {
  networks: NetworkInfo[];
}

interface OverlapItem {
  key: string;
  network: NetworkInfo;
  other: NetworkInfo;
  relation: CidrRelation;
}

export function NetworkWarning({ networks }: NetworkWarningProps) {
  const items: OverlapItem[] = [];
  const seen = new Set<string>();

  for (const network of networks) {
    if (!network.warning) continue;
    for (const { network: other, relation } of overlappingNetworks(networks, network)) {
      const key = [network.id, other.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ key, network, other, relation });
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="net-warning" role="alert">
      <div className="net-warning-icon">
        <TriangleAlert size={18} />
      </div>
      <div className="net-warning-body">
        <div className="net-warning-title">
          <strong>子网重叠</strong>
          <Badge tone="red" dot>
            {items.length} 组
          </Badge>
        </div>
        {items.map(({ key, network, other, relation }) => (
          <div key={key} className="net-warning-item">
            <p className="net-warning-text">
              <span className="mono">{network.name}</span> ↔{" "}
              <span className="mono">{other.name}</span>
            </p>
            <div className="net-warning-cidrs">
              <span>CIDR</span>
              <code className="net-cidr-code">{network.subnet}</code>
              <code className="net-cidr-code">{other.subnet}</code>
              <span className="net-warning-affected">
                <em>{relationLabel(relation)}</em>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
