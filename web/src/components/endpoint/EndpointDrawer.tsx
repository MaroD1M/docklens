import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Eye, EyeOff, Star, X } from "lucide-react";
import type { Endpoint, NetworkInfo } from "../../types";
import { containers } from "../../data/mock";
import {
  classNames,
  endpointAddress,
  endpointUrl,
  primaryIp,
  scopeLabels,
  sourceLabels,
  statusLabels,
} from "../../lib/format";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { StatusDot } from "../ui/StatusDot";

interface EndpointDrawerProps {
  endpoint: Endpoint;
  network?: NetworkInfo;
  hidden: boolean;
  favorite: boolean;
  onClose: () => void;
  onToggleFavorite: () => void;
  onToggleHidden: () => void;
}

type TabKey = "overview" | "ports" | "network" | "tags";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "概览" },
  { key: "ports", label: "端口" },
  { key: "network", label: "网络" },
  { key: "tags", label: "标签" },
];

const ipKindLabels: Record<string, string> = {
  lan: "局域网",
  vpn: "VPN",
  loopback: "回环",
  container: "容器",
  public: "公网",
  other: "其他",
};

function formatAddress(ip: string, port: number): string {
  return `${ip.includes(":") ? `[${ip}]` : ip}:${port}`;
}

export function EndpointDrawer({
  endpoint,
  network,
  hidden,
  favorite,
  onClose,
  onToggleFavorite,
  onToggleHidden,
}: EndpointDrawerProps) {
  const [tab, setTab] = useState<TabKey>("overview");
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setTab("overview");
  }, [endpoint.id]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
  }, [endpoint.id]);

  const accessIps = endpoint.accessIps?.length
    ? endpoint.accessIps
    : [{ ip: primaryIp(endpoint), kind: "lan" as const, preferred: true }];

  const containerInfo = containers.find(
    (item) =>
      item.name === endpoint.container ||
      item.service === endpoint.container ||
      item.service === endpoint.service,
  );
  const containerNetwork =
    containerInfo?.networks.find((item) => item.name === endpoint.network) ??
    containerInfo?.networks[0];
  const networkContainerIp = network?.usedIps.find(
    (item) => item.container === endpoint.container,
  )?.ip;
  const containerIp =
    containerNetwork?.ip ??
    networkContainerIp ??
    (endpoint.container === "—" ? "—" : endpoint.ip);

  const statusDot = hidden || endpoint.status === "hidden"
    ? "hidden"
    : endpoint.source === "INFERRED"
      ? "inferred"
      : endpoint.status;
  const statusText = hidden || endpoint.status === "hidden"
    ? statusLabels.hidden
    : endpoint.source === "INFERRED"
      ? "推断"
      : statusLabels[endpoint.status];

  const autoTags = useMemo(
    () => [
      `stack:${endpoint.stack ?? "未归类"}`,
      `proto:${endpoint.protocol}`,
      `source:${sourceLabels[endpoint.source]}`,
    ],
    [endpoint],
  );

  return (
    <>
      <button
        type="button"
        className="drawer-scrim"
        aria-label="关闭端点详情"
        onClick={onClose}
      />
      <aside
        className="drawer ep-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ep-drawer-title"
      >
        <div className="drawer-head">
          <div>
            <div className="ep-drawer-eyebrow">端点详情</div>
            <h2 className="ep-drawer-title" id="ep-drawer-title">
              {endpoint.service}
            </h2>
            <p className="ep-drawer-sub">
              {endpointAddress(endpoint)} · {endpoint.container}
            </p>
          </div>
          <div className="ep-drawer-head-actions">
            <button
              type="button"
              className={classNames("icon-btn", favorite && "ep-icon-active")}
              aria-label={favorite ? "取消收藏" : "收藏端点"}
              aria-pressed={favorite}
              title={favorite ? "取消收藏" : "收藏"}
              onClick={onToggleFavorite}
            >
              <Star size={15} fill={favorite ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={hidden ? "取消隐藏" : "隐藏端点"}
              aria-pressed={hidden}
              title={hidden ? "取消隐藏" : "隐藏"}
              onClick={onToggleHidden}
            >
              {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <button
              ref={closeRef}
              type="button"
              className="icon-btn"
              aria-label="关闭详情"
              title="关闭"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="drawer-tabs" role="tablist" aria-label="端点详情标签">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`ep-tab-${item.key}`}
              aria-selected={tab === item.key}
              aria-controls="ep-panel-detail"
              className={classNames("drawer-tab", tab === item.key && "is-active")}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          <div
            role="tabpanel"
            id="ep-panel-detail"
            aria-labelledby={`ep-tab-${tab}`}
            className="ep-tab-panel"
          >
            {tab === "overview" && (
              <div className="ep-drawer-panel">
                <div className="detail-grid">
                  <div className="detail-item">
                    <span>服务</span>
                    <strong>{endpoint.service}</strong>
                  </div>
                  <div className="detail-item">
                    <span>容器</span>
                    <strong>{endpoint.container}</strong>
                  </div>
                  <div className="detail-item">
                    <span>镜像</span>
                    <strong className="mono">{endpoint.image}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Stack</span>
                    <strong>{endpoint.stack ?? "—"}</strong>
                  </div>
                  <div className="detail-item">
                    <span>作用域</span>
                    <strong>{scopeLabels[endpoint.scope]}</strong>
                  </div>
                  <div className="detail-item">
                    <span>来源</span>
                    <strong>{sourceLabels[endpoint.source]}</strong>
                  </div>
                  <div className="detail-item">
                    <span>可信度</span>
                    <strong className="mono">{endpoint.confidence}%</strong>
                  </div>
                  <div className="detail-item">
                    <span>状态</span>
                    <strong className="ep-status-inline">
                      <StatusDot status={statusDot} pulse={statusDot === "running"} />
                      <span>{statusText}</span>
                    </strong>
                  </div>
                  <div className="detail-item">
                    <span>最近刷新</span>
                    <strong className="mono">{endpoint.updatedAt}</strong>
                  </div>
                </div>

                {endpoint.note && <div className="ep-drawer-note">{endpoint.note}</div>}

                <div className="ep-drawer-actions">
                  <CopyButton
                    value={endpointAddress(endpoint)}
                    variant="solid"
                    label="复制端点"
                    toast={`已复制 ${endpointAddress(endpoint)}`}
                  />
                  <CopyButton
                    value={endpointUrl(endpoint)}
                    variant="ghost"
                    label="复制 URL"
                    toast={`已复制 ${endpointUrl(endpoint)}`}
                  />
                  <a
                    className="btn"
                    href={endpointUrl(endpoint)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} /> 打开 URL
                  </a>
                </div>
              </div>
            )}

            {tab === "ports" && (
              <div className="ep-drawer-panel">
                <div className="port-diagram">
                  <span>{endpointAddress(endpoint)}</span>
                  <span className="arrow">→</span>
                  <span>
                    {endpoint.containerPort ?? endpoint.port}/{endpoint.protocol}
                  </span>
                </div>

                <div className="ep-drawer-section">
                  <div className="ep-section-head">
                    <span className="ep-drawer-section-title">访问地址</span>
                    <span className="small muted">{accessIps.length} 个</span>
                  </div>
                  <div className="ep-address-list">
                    {accessIps.map((item) => {
                      const address = formatAddress(item.ip, endpoint.port);
                      return (
                        <div className="ep-address-row" key={`${item.ip}-${item.kind}`}>
                          <div className="ep-address-main">
                            <strong>{address}</strong>
                            <span>
                              {ipKindLabels[item.kind] ?? item.kind}
                              {item.iface ? ` · ${item.iface}` : ""}
                              {item.preferred ? " · 首选" : ""}
                            </span>
                          </div>
                          <CopyButton
                            value={address}
                            variant="chip"
                            iconOnly
                            title={`复制 ${address}`}
                            toast={`已复制 ${address}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="ep-drawer-section">
                  <div className="ep-section-head">
                    <span className="ep-drawer-section-title">URL</span>
                  </div>
                  <div className="ep-address-row">
                    <div className="ep-address-main">
                      <strong>{endpointUrl(endpoint)}</strong>
                      <span>{endpoint.url ? "配置" : "推断"}</span>
                    </div>
                    <div className="ep-address-actions">
                      <CopyButton
                        value={endpointUrl(endpoint)}
                        variant="chip"
                        iconOnly
                        title="复制 URL"
                        toast={`已复制 ${endpointUrl(endpoint)}`}
                      />
                      <a
                        className="icon-btn"
                        href={endpointUrl(endpoint)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="打开 URL"
                        title="打开 URL"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="ep-drawer-section">
                  <div className="ep-section-head">
                    <span className="ep-drawer-section-title">端口映射</span>
                  </div>
                  <div className="ep-address-row">
                    <div className="ep-address-main">
                      <strong>
                        {endpoint.port}/{endpoint.protocol} →{" "}
                        {endpoint.containerPort ?? "—"}/{endpoint.protocol}
                      </strong>
                      <span>宿主 → 容器</span>
                    </div>
                    <CopyButton
                      value={`${endpoint.port}/${endpoint.protocol} → ${endpoint.containerPort ?? endpoint.port}/${endpoint.protocol}`}
                      variant="chip"
                      iconOnly
                      title="复制映射关系"
                      toast="已复制端口映射"
                    />
                  </div>
                </div>
              </div>
            )}

            {tab === "network" && (
              <div className="ep-drawer-panel">
                <div className="detail-grid">
                  <div className="detail-item">
                    <span>网络</span>
                    <strong>{network?.name ?? endpoint.network}</strong>
                  </div>
                  <div className="detail-item">
                    <span>驱动</span>
                    <strong>{network?.driver ?? "未知"}</strong>
                  </div>
                  <div className="detail-item">
                    <span>容器 IP</span>
                    <strong className="mono">{containerIp}</strong>
                  </div>
                  <div className="detail-item">
                    <span>绑定 IP</span>
                    <strong className="mono">{endpoint.ip}</strong>
                  </div>
                  <div className="detail-item">
                    <span>网关</span>
                    <strong className="mono">{network?.gateway ?? "—"}</strong>
                  </div>
                  <div className="detail-item">
                    <span>子网</span>
                    <strong className="mono">{network?.subnet ?? "—"}</strong>
                  </div>
                  <div className="detail-item">
                    <span>作用域</span>
                    <strong>{scopeLabels[endpoint.scope]}</strong>
                  </div>
                  <div className="detail-item">
                    <span>网络 ID</span>
                    <strong className="mono">{endpoint.networkId ?? network?.id ?? "—"}</strong>
                  </div>
                  <div className="detail-item">
                    <span>网络容器数</span>
                    <strong className="mono">{network ? network.containerCount : "—"}</strong>
                  </div>
                </div>
                {network?.internal && (
                  <div className="ep-drawer-note">internal 网络，无法访问外网</div>
                )}
              </div>
            )}

            {tab === "tags" && (
              <div className="ep-drawer-panel">
                <div className="ep-drawer-section">
                  <div className="ep-section-head">
                    <span className="ep-drawer-section-title">标签</span>
                    <span className="small muted">{endpoint.tags.length} 个</span>
                  </div>
                  {endpoint.tags.length > 0 ? (
                    <div className="ep-tag-list">
                      {endpoint.tags.map((tag) => (
                        <Badge key={tag} tone="cyan">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="small muted">无标签</p>
                  )}
                </div>

                <div className="ep-drawer-section">
                  <div className="ep-section-head">
                    <span className="ep-drawer-section-title">自动标签</span>
                  </div>
                  <div className="ep-tag-list">
                    {autoTags.map((tag) => (
                      <Badge key={tag} tone="muted">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}


          </div>
        </div>
      </aside>
    </>
  );
}
