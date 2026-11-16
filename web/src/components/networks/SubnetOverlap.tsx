import type { NetworkInfo } from "../../types";
import { ArrowRight } from "lucide-react";
import { Badge } from "../ui/Badge";
import { HoloCard } from "../ui/HoloCard";
import { SectionHeader } from "../ui/SectionHeader";
import { findOverlaps, relationLabel } from "./networkUtils";

interface SubnetOverlapProps {
  networks: NetworkInfo[];
}

export function SubnetOverlap({ networks }: SubnetOverlapProps) {
  const pairs = findOverlaps(networks);

  return (
    <HoloCard className="net-overlap" as="section">
      <SectionHeader
        eyebrow="子网重叠"
        title="CIDR 关系"
        action={<span className="net-overlap-count">{pairs.length} 组</span>}
      />

      {pairs.length === 0 ? (
        <p className="net-overlap-empty">未发现子网重叠。</p>
      ) : (
        <div className="net-overlap-list">
          {pairs.map((pair) => (
            <div
              key={`${pair.a.id}-${pair.b.id}`}
              className={`net-overlap-row ${pair.relation === "same" ? "is-danger" : "is-warning"}`}
            >
              <div className="net-overlap-head">
                <Badge tone={pair.relation === "same" ? "red" : "amber"} dot>
                  {relationLabel(pair.relation)}
                </Badge>
                <div className="net-overlap-pair">
                  <span className="net-overlap-name">{pair.a.name}</span>
                  <code className="net-cidr-code">{pair.a.subnet}</code>
                  <ArrowRight size={12} aria-hidden="true" />
                  <span className="net-overlap-name">{pair.b.name}</span>
                  <code className="net-cidr-code">{pair.b.subnet}</code>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </HoloCard>
  );
}
