import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  Cable,
  Clock3,
  Download,
  ExternalLink,
  Minus,
  Network,
  Plus,
  PlusCircle,
  RefreshCw,
  TriangleAlert,
  Waypoints,
} from "lucide-react";

import { CountUp } from "../components/overview/CountUp";
import { DistributionPanel } from "../components/overview/DistributionPanel";
import { NetworkRadar } from "../components/overview/NetworkRadar";
import { Badge } from "../components/ui/Badge";
import { CopyButton } from "../components/ui/CopyButton";
import { EmptyState } from "../components/ui/EmptyState";
import { HoloCard } from "../components/ui/HoloCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatusDot } from "../components/ui/StatusDot";
import { useToast } from "../components/ui/Toast";
import { endpoints, networks, overviewStats, quickAccess, recentEvents } from "../data/mock";
import { useDataVersion, useHostInfo } from "../data/DataProvider";
import { findPortConflicts } from "../lib/conflicts";
import { requestRefresh } from "../lib/api";
import {
  endpointAddress,
  endpointUrl,
  primaryIp,
  sourceLabels,
  statusLabels,
} from "../lib/format";
import type { RecentEvent } from "../types";
import "../components/overview/overview.css";

type MetricTone = "up" | "warn" | "danger";
type MetricGlow = "none" | "cyan" | "amber" | "danger" | "green";

interface MetricItem {
  key: string;
  label: string;
  value: number;
  icon: typeof Boxes;
  foot: string;
  to: string;
  tone?: MetricTone;
  glow?: MetricGlow;
  cardClass?: string;
}

type AttentionSeverity = "danger" | "warning";

interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  actionLabel: string;
  to: string;
  icon: typeof TriangleAlert;
}

const eventIcons: Record<RecentEvent["type"], typeof Plus> = {
  added: Plus,
  removed: Minus,
  changed: RefreshCw,
  warning: TriangleAlert,
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

export function OverviewPage() {
  const dataVersion = useDataVersion();
  const host = useHostInfo();
  const { push } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const portConflicts = useMemo(() => findPortConflicts(endpoints), [dataVersion]);
  const portConflict = portConflicts[0] ?? null;

  const tcpCount = endpoints.filter((endpoint) => endpoint.protocol === "tcp").length;
  const udpCount = endpoints.filter((endpoint) => endpoint.protocol === "udp").length;
  const ipChange = recentEvents.find(
    (event) => event.type === "changed" && event.title.toLowerCase().includes("immich"),
  );
  const staleEndpoint = endpoints.find((endpoint) => endpoint.status === "stale");
  const overlapNetwork = networks.find((network) => Boolean(network.warning));
  const latestAdded = recentEvents.find((event) => event.type === "added");

  const attentionItems: AttentionItem[] = [];

  if (portConflict) {
    attentionItems.push({
      id: "port-conflict",
      severity: "danger",
      title: `${portConflict.port}/${portConflict.protocol} 端口冲突`,
      detail: `${portConflict.services.join("、")} 使用了同一端口`,
      actionLabel: "查看端点",
      to: `/endpoints?q=${encodeURIComponent(`:${portConflict.port}`)}`,
      icon: TriangleAlert,
    });
  }

  if (overlapNetwork) {
    attentionItems.push({
      id: "subnet-overlap",
      severity: "danger",
      title: `${overlapNetwork.name} 子网重叠`,
      detail: overlapNetwork.warning ?? `${overlapNetwork.subnet} 与现有子网重叠`,
      actionLabel: "查看网络",
      to: "/networks",
      icon: Waypoints,
    });
  }

  if (staleEndpoint) {
    attentionItems.push({
      id: "stale-endpoint",
      severity: "warning",
      title: `${staleEndpoint.service} 端口未监听`,
      detail: `${endpointAddress(staleEndpoint)} · ${staleEndpoint.note ?? "标记为最后已知状态"}`,
      actionLabel: "查看端点",
      to: `/endpoints?q=${encodeURIComponent(staleEndpoint.service)}`,
      icon: Clock3,
    });
  }

  if (ipChange) {
    attentionItems.push({
      id: "immich-ip-change",
      severity: "warning",
      title: "immich-server IP 已变化",
      detail: ipChange.detail,
      actionLabel: "查看网络",
      to: "/networks",
      icon: RefreshCw,
    });
  }

  const metrics: MetricItem[] = [
    {
      key: "containers",
      label: "容器",
      value: overviewStats.containers,
      icon: Boxes,
      foot: `${overviewStats.containers} 个运行中`,
      to: "/endpoints",
    },
    {
      key: "endpoints",
      label: "端点",
      value: overviewStats.endpoints,
      icon: Cable,
      foot: `${tcpCount} TCP · ${udpCount} UDP`,
      to: "/endpoints",
    },
    {
      key: "networks",
      label: "网络",
      value: overviewStats.networks,
      icon: Network,
      foot: `${networks.length} 个网络在册`,
      to: "/networks",
    },
    {
      key: "conflicts",
      label: "冲突",
      value: portConflicts.length,
      icon: TriangleAlert,
      foot: portConflict ? `${portConflict.port}/${portConflict.protocol} 待处理` : "无端口冲突",
      to: "/ports",
      tone: "danger",
      glow: "danger",
      cardClass: "ov-metric-danger",
    },
    {
      key: "newToday",
      label: "今日新增",
      value: overviewStats.newToday,
      icon: PlusCircle,
      foot: latestAdded ? `最近发现 ${latestAdded.at}` : "今日新发现",
      to: "/endpoints",
      tone: "up",
    },
    {
      key: "ipChanges",
      label: "IP 变化",
      value: overviewStats.ipChanges,
      icon: ArrowLeftRight,
      foot: ipChange ? "immich-server" : "24 小时内",
      to: "/networks",
      tone: "warn",
      glow: "amber",
      cardClass: "ov-metric-warn",
    },
  ];

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void requestRefresh();
    timer.current = window.setTimeout(() => {
      setRefreshing(false);
      setRefreshKey((current) => current + 1);
    }, 1100);
  };

  const exportSnapshot = () => {
    const snapshot = {
      generatedAt: new Date().toISOString(),
      host: host.name,
      dockerVersion: host.dockerVersion,
      stats: overviewStats,
      quickAccess: quickAccess.map((endpoint) => ({
        service: endpoint.service,
        address: endpointAddress(endpoint),
        url: endpointUrl(endpoint),
      })),
      attention: attentionItems.map(({ title, detail, severity }) => ({ title, detail, severity })),
      recent: recentEvents,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `docklens-overview-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    push("已导出概览快照");
  };

  return (
    <div className="page ov-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">总览</h1>
          <p className="page-subtitle">容器、网络与访问地址</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={exportSnapshot}>
            <Download size={14} aria-hidden="true" />
            导出
          </button>
          <button
            type="button"
            className={`btn btn-primary ${refreshing ? "is-spinning" : ""}`}
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="刷新概览数据"
          >
            <RefreshCw size={14} aria-hidden="true" />
            {refreshing ? "扫描中" : "刷新"}
          </button>
        </div>
      </header>

      <div className="metric-grid" key={refreshKey} aria-busy={refreshing}>
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Link
              key={metric.key}
              to={metric.to}
              className="ov-metric-link"
              aria-label={`${metric.label} ${metric.value}，查看详情`}
            >
              <HoloCard
                className={`metric-card ov-metric ${metric.cardClass ?? ""}`}
                glow={metric.glow ?? "none"}
                interactive
              >
                <div className="metric-label">
                  <Icon size={14} aria-hidden="true" />
                  {metric.label}
                </div>
                <div className="metric-value">
                  <CountUp value={metric.value} />
                </div>
                <div className={`metric-foot ${metric.tone ? `metric-trend-${metric.tone}` : ""}`}>
                  <span>{metric.foot}</span>
                </div>
              </HoloCard>
            </Link>
          );
        })}
      </div>

      <div className="ov-scan-grid">
        <NetworkRadar endpoints={endpoints} />
        <DistributionPanel endpoints={endpoints} networks={networks} />
      </div>

      <div className="ov-lower-grid">
        <section className="ov-section">
          <SectionHeader
            title="快捷访问"
            action={
              <Link className="btn btn-sm" to="/endpoints">
                全部
              </Link>
            }
          />
          {quickAccess.length > 0 ? (
            <div className="ov-quick-grid">
              {quickAccess.map((endpoint) => (
                <HoloCard key={endpoint.id} interactive className="ov-quick-card">
                  <div className="ov-quick-top">
                    <span className="ov-quick-mark" aria-hidden="true">
                      {initials(endpoint.service)}
                    </span>
                    <div className="ov-quick-copy">
                      <strong>{endpoint.service}</strong>
                      <span>
                        {endpoint.stack ? `${endpoint.stack} · ` : ""}
                        {endpoint.network}
                      </span>
                    </div>
                    <span className="ov-quick-status">
                      <StatusDot status={endpoint.status} />
                      {statusLabels[endpoint.status]}
                    </span>
                  </div>

                  <div className="ov-quick-address">
                    <span className="mono">{endpointAddress(endpoint)}</span>
                    <span className="ov-quick-port">
                      {endpoint.containerPort ? `${endpoint.containerPort}/${endpoint.protocol}` : endpoint.protocol}
                    </span>
                  </div>

                  <div className="ov-quick-badges">
                    <Badge tone="cyan" dot>
                      {endpoint.protocol.toUpperCase()}
                    </Badge>
                    <Badge tone="blue">{sourceLabels[endpoint.source]}</Badge>
                    {endpoint.scope === "HOST_NET" && <Badge tone="violet">host 网络</Badge>}
                  </div>

                  <div className="ov-quick-actions">
                    <CopyButton
                      value={primaryIp(endpoint)}
                      label="复制 IP"
                      variant="ghost"
                      toast={`已复制 ${primaryIp(endpoint)}`}
                    />
                    <CopyButton
                      value={endpointAddress(endpoint)}
                      label="复制端点"
                      variant="ghost"
                      toast={`已复制 ${endpointAddress(endpoint)}`}
                    />
                    <a
                      className="btn btn-sm btn-primary ov-quick-open"
                      href={endpointUrl(endpoint)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`打开 ${endpoint.service}`}
                    >
                      <ExternalLink size={13} aria-hidden="true" />
                      打开
                    </a>
                  </div>
                </HoloCard>
              ))}
            </div>
          ) : (
            <HoloCard className="ov-quick-empty">
              <EmptyState
                compact
                title="暂无收藏端点"
                description="在端点页收藏后显示。"
                action={
                  <Link className="btn btn-sm" to="/endpoints">
                    端点页
                  </Link>
                }
              />
            </HoloCard>
          )}
        </section>

        <section className="ov-section">
          <SectionHeader
            title="待处理"
            action={<Badge tone="amber">{attentionItems.length} 项</Badge>}
          />
          <HoloCard className="ov-attention-card">
            <div className="ov-attention-list">
              {attentionItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className={`ov-attention-item is-${item.severity}`}>
                    <span className="ov-attention-icon" aria-hidden="true">
                      <Icon size={15} />
                    </span>
                    <div className="ov-attention-copy">
                      <div className="ov-attention-title">
                        <span>{item.title}</span>
                        <span className={`badge ${item.severity === "danger" ? "badge-red" : "badge-amber"}`}>
                          {item.severity === "danger" ? "高危" : "注意"}
                        </span>
                      </div>
                      <p className="ov-attention-detail">{item.detail}</p>
                    </div>
                    <Link
                      className="ov-attention-link"
                      to={item.to}
                      aria-label={`${item.actionLabel}：${item.title}`}
                    >
                      {item.actionLabel}
                      <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </HoloCard>
        </section>
      </div>

      <section className="ov-section">
        <SectionHeader
          title="最近变化"
          action={
            <span className="scan-hint" title="事件流已连接">
              <span className="status-dot status-running status-pulse" />
              已连接
            </span>
          }
        />
        <HoloCard className="ov-timeline-card">
          <ol className="ov-timeline" aria-label="最近变化">
            {recentEvents.map((event) => {
              const Icon = eventIcons[event.type];
              return (
                <li key={event.id} className={`ov-timeline-item ov-event-${event.type}`}>
                  <span className="ov-timeline-node" aria-hidden="true">
                    <Icon size={13} />
                  </span>
                  <div className="ov-timeline-copy">
                    <strong>{event.title}</strong>
                    <span>{event.detail}</span>
                  </div>
                  <span className="ov-timeline-time mono">{event.at}</span>
                </li>
              );
            })}
          </ol>
        </HoloCard>
      </section>

    </div>
  );
}
