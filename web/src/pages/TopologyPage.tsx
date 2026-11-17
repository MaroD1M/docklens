import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { HoloCard } from "../components/ui/HoloCard";
import { TopologyGraph, type TopologyLayout } from "../components/topology/TopologyGraph";
import { endpoints, networks } from "../data/mock";
import { useDataVersion } from "../data/DataProvider";

const topologyScopes = new Set(["HOST", "LAN", "HOST_NET"]);

export function TopologyPage() {
  const dataVersion = useDataVersion();
  const [layout, setLayout] = useState<TopologyLayout>("layered");
  const [animation, setAnimation] = useState(true);
  const [networkFilter, setNetworkFilter] = useState("all");
  const [onlyPublished, setOnlyPublished] = useState(false);

  useEffect(() => {
    if (networkFilter === "all") return;
    const exists = networks.some(
      (network) => network.id === networkFilter || network.name === networkFilter,
    );
    if (!exists) setNetworkFilter("all");
  }, [dataVersion, networkFilter]);

  const baseEndpoints = useMemo(
    () =>
      endpoints.filter((endpoint) => {
        if (!topologyScopes.has(endpoint.scope)) return false;
        if (onlyPublished && endpoint.source !== "PUBLISHED") return false;
        return true;
      }),
    [dataVersion, onlyPublished],
  );

  const visibleEndpoints = useMemo(
    () =>
      networkFilter === "all"
        ? baseEndpoints
        : baseEndpoints.filter(
            (endpoint) =>
              endpoint.networkId === networkFilter || endpoint.network === networkFilter,
          ),
    [baseEndpoints, networkFilter],
  );

  const networkCounts = useMemo(() => {
    const counts = new Map<string, number>();
    baseEndpoints.forEach((endpoint) => {
      const key = endpoint.networkId ?? endpoint.network;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [baseEndpoints]);

  const visibleNetworks = networkFilter === "all" ? networks : networks.filter(
    (network) => network.id === networkFilter || network.name === networkFilter,
  );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">拓扑</h1>
          <p className="page-subtitle">网络归属关系</p>
        </div>
        <div className="page-actions">
          <Badge tone="cyan" dot>
            {visibleNetworks.length} 网络 · {visibleEndpoints.length} 端点
          </Badge>
          <div className="segmented" role="group" aria-label="拓扑布局">
            <button
              type="button"
              className={layout === "layered" ? "is-active" : ""}
              aria-pressed={layout === "layered"}
              onClick={() => setLayout("layered")}
            >
              分层
            </button>
            <button
              type="button"
              className={layout === "compact" ? "is-active" : ""}
              aria-pressed={layout === "compact"}
              onClick={() => setLayout("compact")}
            >
              紧凑
            </button>
          </div>
        </div>
      </header>

      <HoloCard className="topo-shell">
        <div className="topo-toolbar">
          <div className="topo-chips" role="group" aria-label="按网络筛选">
            <button
              type="button"
              className={`chip ${networkFilter === "all" ? "is-active" : ""}`}
              aria-pressed={networkFilter === "all"}
              onClick={() => setNetworkFilter("all")}
            >
              全部网络
              <span className="chip-count">{baseEndpoints.length}</span>
            </button>
            {networks.map((network) => {
              const count =
                networkCounts.get(network.id) ?? networkCounts.get(network.name) ?? 0;
              return (
                <button
                  key={network.id}
                  type="button"
                  className={`chip ${networkFilter === network.id ? "is-active" : ""}`}
                  aria-pressed={networkFilter === network.id}
                  onClick={() => setNetworkFilter(network.id)}
                >
                  {network.name}
                  <span className="chip-count">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="topo-toolbar-right">
            <label className="topo-toggle">
              <input
                type="checkbox"
                checked={onlyPublished}
                onChange={(event) => setOnlyPublished(event.target.checked)}
              />
              <span className="topo-switch-track" aria-hidden="true" />
              <span>只看发布端口</span>
            </label>
            <label className="topo-toggle">
              <input
                type="checkbox"
                checked={animation}
                onChange={(event) => setAnimation(event.target.checked)}
              />
              <span className="topo-switch-track" aria-hidden="true" />
              <span>边动画</span>
            </label>
          </div>
        </div>

        <div className="topo-legend" aria-label="节点图例">
          <span className="topo-legend-item">
            <span className="topo-legend-swatch topo-legend-host" aria-hidden="true" />
            宿主
          </span>
          <span className="topo-legend-item">
            <span className="topo-legend-swatch topo-legend-network" aria-hidden="true" />
            网络
          </span>
          <span className="topo-legend-item">
            <span className="topo-legend-swatch topo-legend-container" aria-hidden="true" />
            容器
          </span>
          <span className="topo-legend-item">
            <span className="topo-legend-swatch topo-legend-endpoint" aria-hidden="true" />
            端点
          </span>
          <span className="topo-legend-note">悬停高亮 · 点击查看</span>
        </div>

        <TopologyGraph
          layout={layout}
          animation={animation}
          networkFilter={networkFilter}
          onlyPublished={onlyPublished}
        />
      </HoloCard>
    </div>
  );
}
