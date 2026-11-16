import { useEffect, useMemo, useState } from "react";
import { Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";
import type { ContainerInfo, Endpoint, NetworkInfo } from "../../types";
import { useDataVersion, useHostInfo } from "../../data/DataProvider";
import { containers as containersList, endpoints as endpointsList, networks as networksList } from "../../data/mock";
import { endpointAddress } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import "./topology.css";

export type TopologyLayout = "layered" | "compact";

interface TopologyGraphProps {
  layout: TopologyLayout;
  animation: boolean;
  networkFilter: string;
  onlyPublished: boolean;
}

type NodeKind = "host" | "network" | "container" | "endpoint";

interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  network?: NetworkInfo;
  container?: ContainerInfo;
  endpoint?: Endpoint;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  d: string;
}

interface ContainerGroupItem {
  name: string;
  info?: ContainerInfo;
  endpoints: Endpoint[];
}

interface NetworkGroup {
  network: NetworkInfo;
  containers: ContainerGroupItem[];
  endpointItems: Endpoint[];
}

const nodeMetrics: Record<NodeKind, { halfWidth: number; height: number; radius: number }> = {
  host: { halfWidth: 84, height: 68, radius: 14 },
  network: { halfWidth: 88, height: 56, radius: 12 },
  container: { halfWidth: 82, height: 44, radius: 10 },
  endpoint: { halfWidth: 70, height: 36, radius: 9 },
};

const kindLabels: Record<NodeKind, string> = {
  host: "宿主",
  network: "网络",
  container: "容器",
  endpoint: "端点",
};

const scopeSet = new Set(["HOST", "LAN", "HOST_NET"]);

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function nodeHalfWidth(kind: NodeKind): number {
  return nodeMetrics[kind].halfWidth;
}

function makePath(from: GraphNode, to: GraphNode): string {
  const startX = from.x + nodeHalfWidth(from.kind);
  const endX = to.x - nodeHalfWidth(to.kind);
  const dx = Math.max(34, (endX - startX) * 0.52);
  return `M ${startX} ${from.y} C ${startX + dx} ${from.y}, ${endX - dx} ${to.y}, ${endX} ${to.y}`;
}

function buildGroups(
  networks: NetworkInfo[],
  containers: ContainerInfo[],
  endpoints: Endpoint[],
  networkFilter: string,
  onlyPublished: boolean,
): NetworkGroup[] {
  const visibleNetworks =
    networkFilter === "all"
      ? networks
      : networks.filter((network) => network.id === networkFilter || network.name === networkFilter);

  const filteredEndpoints = endpoints.filter((endpoint) => {
    if (!scopeSet.has(endpoint.scope)) return false;
    if (onlyPublished && endpoint.source !== "PUBLISHED") return false;
    return true;
  });

  return visibleNetworks.map((network) => {
    const networkEndpoints = filteredEndpoints.filter(
      (endpoint) => endpoint.networkId === network.id || endpoint.network === network.name,
    );

    const containerMap = new Map<string, ContainerGroupItem>();
    containers
      .filter((container) => container.networks.some((entry) => entry.name === network.name))
      .forEach((container) => {
        containerMap.set(container.name, { name: container.name, info: container, endpoints: [] });
      });

    networkEndpoints.forEach((endpoint) => {
      if (!endpoint.container || endpoint.container === "—") return;
      if (!containerMap.has(endpoint.container)) {
        containerMap.set(endpoint.container, { name: endpoint.container, endpoints: [] });
      }
      containerMap.get(endpoint.container)?.endpoints.push(endpoint);
    });

    const containerItems = Array.from(containerMap.values()).sort((a, b) => {
      const aPort = a.endpoints[0]?.port ?? Number.MAX_SAFE_INTEGER;
      const bPort = b.endpoints[0]?.port ?? Number.MAX_SAFE_INTEGER;
      return aPort - bPort || a.name.localeCompare(b.name);
    });

    const endpointItems = [
      ...containerItems.flatMap((item) => [...item.endpoints].sort((a, b) => a.port - b.port)),
      ...networkEndpoints
        .filter(
          (endpoint) =>
            !endpoint.container ||
            endpoint.container === "—" ||
            !containerMap.has(endpoint.container),
        )
        .sort((a, b) => a.port - b.port),
    ];

    return { network, containers: containerItems, endpointItems };
  });
}

export function TopologyGraph({
  layout,
  animation,
  networkFilter,
  onlyPublished,
}: TopologyGraphProps) {
  const dataVersion = useDataVersion();
  const hostInfo = useHostInfo();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const graph = useMemo(() => {
    const config =
      layout === "compact"
        ? {
            top: 42,
            bottom: 34,
            rowGap: 34,
            padding: 15,
            groupGap: 20,
            hostX: 88,
            networkX: 306,
            containerX: 588,
            endpointX: 928,
          }
        : {
            top: 54,
            bottom: 42,
            rowGap: 40,
            padding: 22,
            groupGap: 28,
            hostX: 90,
            networkX: 324,
            containerX: 636,
            endpointX: 976,
          };

    const groups = buildGroups(networksList, containersList, endpointsList, networkFilter, onlyPublished);
    const width = 1120;
    const nodes: GraphNode[] = [];
    const rawEdges: Array<{ id: string; source: string; target: string }> = [];
    const nodeById = new Map<string, GraphNode>();
    const networkNodes: GraphNode[] = [];

    let cursor = config.top;
    let contentBottom = config.top;

    groups.forEach((group) => {
      const slots = Math.max(group.containers.length, group.endpointItems.length, 1);
      const height = Math.max((slots - 1) * config.rowGap + config.padding * 2, 74);
      const top = cursor;
      const innerTop = top + config.padding;
      const innerHeight = height - config.padding * 2;

      const networkNode: GraphNode = {
        id: `net:${group.network.id}`,
        kind: "network",
        label: group.network.name,
        sublabel: `${group.network.driver} · ${group.network.subnet}`,
        x: config.networkX,
        y: top + height / 2,
        network: group.network,
      };
      nodes.push(networkNode);
      nodeById.set(networkNode.id, networkNode);
      networkNodes.push(networkNode);

      const endpointSpan = Math.max((group.endpointItems.length - 1) * config.rowGap, 0);
      const endpointOffset = Math.max((innerHeight - endpointSpan) / 2, 0);
      const endpointYs = group.endpointItems.map(
        (_, index) => innerTop + endpointOffset + index * config.rowGap,
      );
      const endpointIndexById = new Map(
        group.endpointItems.map((endpoint, index) => [endpoint.id, index]),
      );

      const containerYs = group.containers.map((item, index) => {
        const indexes = item.endpoints
          .map((endpoint) => endpointIndexById.get(endpoint.id))
          .filter((value): value is number => value !== undefined);
        if (indexes.length > 0) {
          return indexes.reduce((sum, value) => sum + endpointYs[value], 0) / indexes.length;
        }
        const divisor = Math.max(group.containers.length, 1);
        return innerTop + ((index + 0.5) / divisor) * Math.max(innerHeight, 0);
      });

      const endpointOwner = new Map<string, string>();

      group.containers.forEach((item, index) => {
        const containerId = `ctr:${group.network.id}:${slug(item.name)}`;
        const matchingIp = item.info?.networks.find((entry) => entry.name === group.network.name)?.ip;
        const fallbackIp = item.endpoints[0]?.ip;
        const displayIp =
          matchingIp ?? (fallbackIp && fallbackIp !== "0.0.0.0" && fallbackIp !== "::" ? fallbackIp : "未获取 IP");
        const containerNode: GraphNode = {
          id: containerId,
          kind: "container",
          label: truncate(item.info?.name ?? item.name, 18),
          sublabel: displayIp,
          x: config.containerX,
          y: containerYs[index],
          network: group.network,
          container: item.info,
        };
        nodes.push(containerNode);
        nodeById.set(containerNode.id, containerNode);
        rawEdges.push({
          id: `edge:${networkNode.id}:${containerNode.id}`,
          source: networkNode.id,
          target: containerNode.id,
        });
        item.endpoints.forEach((endpoint) => endpointOwner.set(endpoint.id, containerNode.id));
      });

      group.endpointItems.forEach((endpoint, index) => {
        const endpointNode: GraphNode = {
          id: `ep:${endpoint.id}`,
          kind: "endpoint",
          label: `${endpoint.port}/${endpoint.protocol}`,
          sublabel: truncate(endpoint.service, 15),
          x: config.endpointX,
          y: endpointYs[index],
          network: group.network,
          endpoint,
        };
        nodes.push(endpointNode);
        nodeById.set(endpointNode.id, endpointNode);
        rawEdges.push({
          id: `edge:${endpointOwner.get(endpoint.id) ?? networkNode.id}:${endpointNode.id}`,
          source: endpointOwner.get(endpoint.id) ?? networkNode.id,
          target: endpointNode.id,
        });
      });

      contentBottom = top + height;
      cursor = contentBottom + config.groupGap;
    });

    const firstNetwork = networkNodes[0];
    const hostY = firstNetwork ? firstNetwork.y : config.top + 220;

    const hostNode: GraphNode = {
      id: "host:local",
      kind: "host",
      label: hostInfo.name,
      sublabel: `${hostInfo.ip || "本地"} · ${containersList.length} 容器`,
      x: config.hostX,
      y: hostY,
    };
    nodes.unshift(hostNode);
    nodeById.set(hostNode.id, hostNode);
    networkNodes.forEach((networkNode) => {
      rawEdges.push({
        id: `edge:${hostNode.id}:${networkNode.id}`,
        source: hostNode.id,
        target: networkNode.id,
      });
    });

    const edges: GraphEdge[] = rawEdges
      .map((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return null;
        return { ...edge, d: makePath(source, target) };
      })
      .filter((edge): edge is GraphEdge => edge !== null);

    const height = Math.max(contentBottom + config.bottom, hostY + 120, 420);

    return { nodes, edges, width, height };
  }, [layout, networkFilter, onlyPublished, dataVersion, hostInfo.name, hostInfo.ip]);

  const focusId = hoveredId ?? selectedId;

  const relatedIds = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    graph.edges.forEach((edge) => {
      if (edge.source === focusId) set.add(edge.target);
      if (edge.target === focusId) set.add(edge.source);
    });
    return set;
  }, [focusId, graph.edges]);

  const selectedNode = selectedId ? graph.nodes.find((node) => node.id === selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !graph.nodes.some((node) => node.id === selectedId)) {
      setSelectedId(null);
    }
  }, [graph.nodes, selectedId]);

  useEffect(() => {
    setHoveredId(null);
  }, [networkFilter, onlyPublished, layout]);

  const relatedNodes = useMemo(() => {
    if (!selectedNode) return [];
    const map = new Map<string, GraphNode>();
    graph.edges.forEach((edge) => {
      if (edge.source === selectedNode.id) {
        const node = graph.nodes.find((entry) => entry.id === edge.target);
        if (node) map.set(node.id, node);
      }
      if (edge.target === selectedNode.id) {
        const node = graph.nodes.find((entry) => entry.id === edge.source);
        if (node) map.set(node.id, node);
      }
    });
    return Array.from(map.values());
  }, [graph.edges, graph.nodes, selectedNode]);

  if (graph.nodes.length <= 1) {
    return (
      <div className="topo-empty">
        <span>当前筛选无节点。</span>
      </div>
    );
  }

  const viewWidth = graph.width / zoom;
  const viewHeight = graph.height / zoom;
  const viewBox = `${(graph.width - viewWidth) / 2} ${(graph.height - viewHeight) / 2} ${viewWidth} ${viewHeight}`;

  const packetEdges = graph.edges.filter((_, index) => index % 2 === 0).slice(0, 22);
  const canZoomOut = zoom > 0.75;
  const canZoomIn = zoom < 2;

  const changeZoom = (value: number) => {
    setZoom(Math.max(0.75, Math.min(2, value)));
  };

  const selectedCidr = selectedNode
    ? selectedNode.network?.subnet ??
      (selectedNode.kind === "host"
        ? networksList.find((network) => network.name === "host")?.subnet ?? "192.168.1.0/24"
        : undefined)
    : undefined;

  const copyValue =
    selectedNode?.kind === "endpoint" && selectedNode.endpoint
      ? endpointAddress(selectedNode.endpoint)
      : selectedNode?.kind === "network" && selectedNode.network?.subnet
        ? selectedNode.network.subnet
        : selectedNode?.kind === "container"
          ? selectedNode.container?.networks[0]?.ip ?? selectedNode.label
          : hostInfo.ip || "—";

  const copyLabel =
    selectedNode?.kind === "endpoint"
      ? "复制端点"
      : selectedNode?.kind === "network"
        ? "复制 CIDR"
        : selectedNode?.kind === "container"
          ? "复制容器 IP"
          : "复制宿主 IP";

  return (
    <div className="topo-canvas-wrap">
      <div className="topo-canvas">
        <svg
          key={`${layout}-${networkFilter}-${onlyPublished}`}
          className={`topo-graph ${animation ? "is-animated" : ""}`}
          viewBox={viewBox}
          role="group"
          aria-label="容器网络拓扑图，可点击节点查看详情"
        >
          <g>
            {graph.edges.map((edge) => {
              const active = focusId !== null && (edge.source === focusId || edge.target === focusId);
              return (
                <g
                  key={edge.id}
                  className={`topo-edge ${active ? "is-active" : ""} ${
                    focusId !== null && !active ? "is-dim" : ""
                  }`}
                >
                  <path className="topo-edge-path" d={edge.d} />
                </g>
              );
            })}
          </g>

          {animation && (
            <g aria-hidden="true">
              {packetEdges.map((edge, index) => {
                const active = focusId !== null && (edge.source === focusId || edge.target === focusId);
                return (
                  <g
                    key={`packet-${edge.id}`}
                    className={`topo-edge ${active ? "is-active" : ""} ${
                      focusId !== null && !active ? "is-dim" : ""
                    }`}
                  >
                    <circle
                      className="topo-packet"
                      cx={0}
                      cy={0}
                      r={2.2}
                      style={{
                        offsetPath: `path("${edge.d}")`,
                        animationDuration: `${2.8 + (index % 5) * 0.32}s`,
                        animationDelay: `${(index % 7) * 0.33}s`,
                      }}
                    />
                  </g>
                );
              })}
            </g>
          )}

          <g>
            {graph.nodes.map((node) => {
              const active = focusId === null || relatedIds?.has(node.id);
              const metrics = nodeMetrics[node.kind];
              const isSelected = selectedId === node.id;
              return (
                <g
                  key={node.id}
                  className={`topo-node topo-node-${node.kind} ${
                    isSelected ? "is-selected" : ""
                  } ${active ? "" : "is-dim"}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${kindLabels[node.kind]} ${node.label}`}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(node.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={() => setSelectedId(node.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(node.id);
                    }
                  }}
                >
                  <rect
                    className="topo-node-halo"
                    x={node.x - metrics.halfWidth - 5}
                    y={node.y - metrics.height / 2 - 5}
                    width={metrics.halfWidth * 2 + 10}
                    height={metrics.height + 10}
                    rx={metrics.radius + 4}
                  />
                  <rect
                    className="topo-node-shape"
                    x={node.x - metrics.halfWidth}
                    y={node.y - metrics.height / 2}
                    width={metrics.halfWidth * 2}
                    height={metrics.height}
                    rx={metrics.radius}
                  />
                  {node.kind === "host" && (
                    <>
                      <circle
                        className="topo-node-accent"
                        cx={node.x - metrics.halfWidth + 20}
                        cy={node.y}
                        r={5}
                      />
                      <circle
                        cx={node.x - metrics.halfWidth + 20}
                        cy={node.y}
                        r={9}
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity={0.35}
                        className="topo-node-accent"
                      />
                    </>
                  )}
                  {node.kind === "network" && (
                    <rect
                      className="topo-node-accent"
                      x={node.x - metrics.halfWidth + 15}
                      y={node.y - 4}
                      width={8}
                      height={8}
                      rx={1.5}
                      transform={`rotate(45 ${node.x - metrics.halfWidth + 19} ${node.y})`}
                    />
                  )}
                  {node.kind === "container" && (
                    <rect
                      className="topo-node-accent"
                      x={node.x - metrics.halfWidth + 14}
                      y={node.y - 4}
                      width={8}
                      height={8}
                      rx={2}
                    />
                  )}
                  {node.kind === "endpoint" && (
                    <circle
                      className="topo-node-accent"
                      cx={node.x - metrics.halfWidth + 17}
                      cy={node.y}
                      r={3.5}
                    />
                  )}
                  <text className="topo-node-label" x={node.x + 6} y={node.y - 2} textAnchor="middle">
                    {node.label}
                  </text>
                  {node.sublabel && (
                    <text className="topo-node-sub" x={node.x + 6} y={node.y + 12} textAnchor="middle">
                      {node.sublabel}
                    </text>
                  )}
                  <title>
                    {node.kind === "endpoint" && node.endpoint
                      ? `${node.endpoint.service} · ${endpointAddress(node.endpoint)}`
                      : node.label}
                  </title>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {selectedNode && (
        <aside className="topo-panel" aria-live="polite" aria-label="节点详情">
          <div className="topo-panel-head">
            <div>
              <div className="topo-panel-kind">
                <Badge
                  tone={
                    selectedNode.kind === "host"
                      ? "cyan"
                      : selectedNode.kind === "network"
                        ? "blue"
                        : selectedNode.kind === "container"
                          ? "green"
                          : "amber"
                  }
                >
                  {kindLabels[selectedNode.kind]}
                </Badge>
              </div>
              <strong>{selectedNode.label}</strong>
            </div>
            <button
              type="button"
              className="topo-panel-close"
              aria-label="关闭节点详情"
              onClick={() => setSelectedId(null)}
            >
              <X size={14} />
            </button>
          </div>

          {selectedNode.kind === "endpoint" && selectedNode.endpoint && (
            <div className="topo-panel-meta">
              <div>
                <span>地址</span>
                <strong className="mono">{endpointAddress(selectedNode.endpoint)}</strong>
              </div>
              <div>
                <span>端口</span>
                <strong className="mono">
                  {selectedNode.endpoint.port}/{selectedNode.endpoint.protocol}
                </strong>
              </div>
              {selectedCidr && (
                <div>
                  <span>CIDR</span>
                  <strong className="mono">{selectedCidr}</strong>
                </div>
              )}
            </div>
          )}

          {selectedNode.kind === "network" && selectedNode.network && (
            <div className="topo-panel-meta">
              <div>
                <span>驱动</span>
                <strong>{selectedNode.network.driver}</strong>
              </div>
              <div>
                <span>CIDR</span>
                <strong className="mono">{selectedNode.network.subnet}</strong>
              </div>
            </div>
          )}

          {selectedNode.kind === "container" && (
            <div className="topo-panel-meta">
              <div>
                <span>地址</span>
                <strong className="mono">
                  {selectedNode.container?.networks.find(
                    (entry) => entry.name === selectedNode.network?.name,
                  )?.ip ?? "未获取"}
                </strong>
              </div>
              <div>
                <span>网络</span>
                <strong>{selectedNode.network?.name ?? "未知"}</strong>
              </div>
              {selectedCidr && (
                <div>
                  <span>CIDR</span>
                  <strong className="mono">{selectedCidr}</strong>
                </div>
              )}
            </div>
          )}

          {selectedNode.kind === "host" && (
            <div className="topo-panel-meta">
              <div>
                <span>地址</span>
                <strong className="mono">{hostInfo.ip || "—"}</strong>
              </div>
              {selectedCidr && (
                <div>
                  <span>CIDR</span>
                  <strong className="mono">{selectedCidr}</strong>
                </div>
              )}
            </div>
          )}

          <div className="topo-panel-actions">
            <CopyButton value={copyValue} label={copyLabel} variant="solid" />
            {selectedCidr && selectedNode.kind !== "network" && (
              <CopyButton value={selectedCidr} label="复制 CIDR" />
            )}
          </div>

          {relatedNodes.length > 0 && (
            <div>
              <div className="topo-panel-related-title">关联节点</div>
              <div className="topo-related-list">
                {relatedNodes.slice(0, 12).map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    className="topo-related-item"
                    onClick={() => setSelectedId(node.id)}
                  >
                    <span className={`topo-related-dot topo-related-${node.kind}`} aria-hidden="true" />
                    <span>{node.label}</span>
                    <em>{kindLabels[node.kind]}</em>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}

      <div className="topo-zoom" role="group" aria-label="缩放拓扑图">
        <button
          type="button"
          aria-label="放大"
          disabled={!canZoomIn}
          onClick={() => changeZoom(zoom + 0.25)}
        >
          <ZoomIn size={14} />
        </button>
        <span className="topo-zoom-level">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="缩小"
          disabled={!canZoomOut}
          onClick={() => changeZoom(zoom - 0.25)}
        >
          <ZoomOut size={14} />
        </button>
        <button type="button" aria-label="重置缩放" onClick={() => setZoom(1)}>
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}

