import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { networks } from "../data/mock";
import { useToast } from "../components/ui/Toast";
import { CopyButton } from "../components/ui/CopyButton";
import { EmptyState } from "../components/ui/EmptyState";
import { SectionHeader } from "../components/ui/SectionHeader";
import { NetworkWarning } from "../components/networks/NetworkWarning";
import { NetworkCard } from "../components/networks/NetworkCard";
import { NetworkDetail } from "../components/networks/NetworkDetail";
import { SubnetOverlap } from "../components/networks/SubnetOverlap";
import { uniqueSubnets } from "../components/networks/networkUtils";
import "../components/networks/networks.css";

const STACKED_LAYOUT = "(max-width: 1099px)";

export function NetworksPage() {
  const { push } = useToast();
  const detailRailRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState(networks[0]?.id ?? "");
  const selected = networks.find((network) => network.id === selectedId) ?? networks[0];
  const allCidrs = uniqueSubnets(networks);

  const selectNetwork = (id: string) => {
    setSelectedId(id);
    const rail = detailRailRef.current;
    if (!rail) return;
    rail.scrollTop = 0;
    if (window.matchMedia(STACKED_LAYOUT).matches) {
      requestAnimationFrame(() => rail.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const exportNetworks = () => {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `docklens-networks-${date}.json`;
    const payload = {
      exportedAt: new Date().toISOString(),
      networks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    push(`已导出 ${filename}`);
  };

  if (!selected) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1 className="page-title">网络</h1>
            <p className="page-subtitle">子网、地址池与重叠检测</p>
          </div>
        </header>
        <EmptyState title="暂无网络" description="未读取到 Docker 网络。检查 Docker socket 后重试。" />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">网络</h1>
          <p className="page-subtitle">子网、地址池与重叠检测</p>
        </div>
        <div className="page-actions">
          <CopyButton
            value={allCidrs.join("\n")}
            label="复制全部 CIDR"
            variant="solid"
            title="复制全部 CIDR"
            toast={`已复制 ${allCidrs.length} 个 CIDR`}
          />
          <button type="button" className="btn" onClick={exportNetworks}>
            <Download size={15} />
            导出
          </button>
        </div>
      </header>

      <NetworkWarning networks={networks} />

      <div className="net-workspace">
        <section className="net-list-pane" aria-label="网络列表">
          <SectionHeader
            title="Docker 网络"
            action={<span className="net-section-count">{networks.length} 个网络</span>}
          />
          <div className="net-card-grid">
            {networks.map((network) => (
              <NetworkCard
                key={network.id}
                network={network}
                selected={network.id === selected.id}
                onSelect={() => selectNetwork(network.id)}
              />
            ))}
          </div>
        </section>

        <aside className="net-detail-rail" aria-label="网络详情" ref={detailRailRef}>
          <NetworkDetail network={selected} />
        </aside>
      </div>

      <SubnetOverlap networks={networks} />
    </div>
  );
}
