import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CheckCheck,
  CircleHelp,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  PanelRight,
  RotateCcw,
  Search,
  Star,
  X,
} from "lucide-react";
import type { Endpoint, EndpointScope, EndpointSource } from "../types";
import { endpoints, networks } from "../data/mock";
import { useDataVersion } from "../data/DataProvider";
import { patchEndpoint } from "../lib/api";
import {
  classNames,
  copyText,
  endpointAddress,
  endpointUrl,
  primaryIp,
  scopeLabels,
  sourceLabels,
  statusLabels,
} from "../lib/format";
import { Badge } from "../components/ui/Badge";
import { CopyButton } from "../components/ui/CopyButton";
import { EmptyState } from "../components/ui/EmptyState";
import { StatusDot } from "../components/ui/StatusDot";
import { useToast } from "../components/ui/Toast";
import { EndpointDrawer } from "../components/endpoint/EndpointDrawer";
import { matchesEndpointQuery, queryRequestsHidden } from "../components/endpoint/search";
import "../components/endpoint/endpoint.css";

type ScopeFilter = EndpointScope | "ALL";
type SourceFilter = EndpointSource | "ALL";
type ProtocolFilter = "ALL" | Endpoint["protocol"];
type ViewMode = "table" | "cards";
type CopyMode = "ip" | "address" | "url";

type BadgeTone = "cyan" | "blue" | "green" | "amber" | "red" | "muted" | "violet";

const scopeOptions: Array<{ value: ScopeFilter; label: string }> = [
  { value: "ALL", label: "全部" },
  { value: "HOST", label: "宿主机" },
  { value: "CONTAINER", label: "容器内" },
  { value: "LAN", label: "局域网" },
  { value: "HOST_NET", label: "host 网络" },
];

const sourceOptions: Array<{ value: SourceFilter; label: string }> = [
  { value: "ALL", label: "全部" },
  { value: "PUBLISHED", label: "发布" },
  { value: "EXPOSED", label: "内部" },
  { value: "HOST_LISTENER", label: "监听" },
  { value: "PROXY_LABEL", label: "反代" },
  { value: "INFERRED", label: "推断" },
];

const protocolOptions: Array<{ value: ProtocolFilter; label: string }> = [
  { value: "ALL", label: "全部" },
  { value: "tcp", label: "TCP" },
  { value: "udp", label: "UDP" },
];

const sourceTone: Record<EndpointSource, BadgeTone> = {
  PUBLISHED: "green",
  HOST_LISTENER: "cyan",
  EXPOSED: "muted",
  PROXY_LABEL: "violet",
  INFERRED: "amber",
  MANUAL: "blue",
};

const protocolTone: Record<Endpoint["protocol"], BadgeTone> = {
  tcp: "cyan",
  udp: "amber",
  sctp: "violet",
};

function displayStatus(
  endpoint: Endpoint,
  hidden: boolean,
): { label: string; dot: "running" | "stale" | "hidden" | "inferred" } {
  if (hidden) return { label: statusLabels.hidden, dot: "hidden" };
  if (endpoint.source === "INFERRED") return { label: "推断", dot: "inferred" };
  return { label: statusLabels[endpoint.status], dot: endpoint.status };
}

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportRecord(endpoint: Endpoint, hidden: boolean, favorite: boolean) {
  return {
    id: endpoint.id,
    service: endpoint.service,
    container: endpoint.container,
    image: endpoint.image,
    stack: endpoint.stack ?? null,
    scope: endpoint.scope,
    scopeLabel: scopeLabels[endpoint.scope],
    source: endpoint.source,
    sourceLabel: sourceLabels[endpoint.source],
    status: hidden ? "hidden" : endpoint.status,
    ip: primaryIp(endpoint),
    port: endpoint.port,
    protocol: endpoint.protocol,
    containerPort: endpoint.containerPort ?? null,
    network: endpoint.network,
    address: endpointAddress(endpoint),
    url: endpointUrl(endpoint),
    tags: endpoint.tags,
    hidden,
    favorite,
    confidence: endpoint.confidence,
    updatedAt: endpoint.updatedAt,
  };
}

export function EndpointsPage() {
  const dataVersion = useDataVersion();
  const [searchParams] = useSearchParams();
  const queryParam = searchParams.get("q") ?? "";

  const [keyword, setKeyword] = useState(queryParam);
  const [scope, setScope] = useState<ScopeFilter>("ALL");
  const [source, setSource] = useState<SourceFilter>("ALL");
  const [protocol, setProtocol] = useState<ProtocolFilter>("ALL");
  const [showHidden, setShowHidden] = useState(false);
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches ? "cards" : "table",
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [hiddenMap, setHiddenMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const endpoint of endpoints) initial[endpoint.id] = endpoint.hidden;
    return initial;
  });
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const endpoint of endpoints) initial[endpoint.id] = endpoint.favorite;
    return initial;
  });

  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const { push } = useToast();

  useEffect(() => {
    setKeyword(queryParam);
  }, [queryParam]);

  useEffect(() => {
    const hidden: Record<string, boolean> = {};
    const favorite: Record<string, boolean> = {};
    for (const endpoint of endpoints) {
      hidden[endpoint.id] = endpoint.hidden;
      favorite[endpoint.id] = endpoint.favorite;
    }
    setHiddenMap(hidden);
    setFavoriteMap(favorite);
  }, [dataVersion]);

  const networkById = useMemo(() => new Map(networks.map((item) => [item.id, item])), [dataVersion]);
  const networkByName = useMemo(() => new Map(networks.map((item) => [item.name, item])), [dataVersion]);

  const getNetwork = (endpoint: Endpoint) =>
    networkById.get(endpoint.networkId ?? "") ?? networkByName.get(endpoint.network);

  const isHidden = (endpoint: Endpoint) => hiddenMap[endpoint.id] ?? endpoint.hidden;
  const isFavorite = (endpoint: Endpoint) => favoriteMap[endpoint.id] ?? endpoint.favorite;

  const visibleEndpoints = useMemo(() => {
    const includeHidden = showHidden || queryRequestsHidden(keyword);
    return endpoints.filter((endpoint) => {
      const hidden = hiddenMap[endpoint.id] ?? endpoint.hidden;
      if (!includeHidden && hidden) return false;
      if (scope !== "ALL" && endpoint.scope !== scope) return false;
      if (source !== "ALL" && endpoint.source !== source) return false;
      if (protocol !== "ALL" && endpoint.protocol !== protocol) return false;
      return matchesEndpointQuery(endpoint, keyword, hidden);
    });
  }, [keyword, scope, source, protocol, showHidden, hiddenMap, dataVersion]);

  const hiddenCount = useMemo(
    () => endpoints.filter((endpoint) => hiddenMap[endpoint.id] ?? endpoint.hidden).length,
    [hiddenMap, dataVersion],
  );

  const activeFilters = useMemo(() => {
    const parts: string[] = [];
    if (keyword.trim()) parts.push(`搜索 ${keyword.trim()}`);
    if (scope !== "ALL") parts.push(`作用域 ${scopeLabels[scope]}`);
    if (source !== "ALL") parts.push(`来源 ${sourceLabels[source]}`);
    if (protocol !== "ALL") parts.push(`协议 ${protocol.toUpperCase()}`);
    if (showHidden) parts.push("显示已隐藏");
    return parts;
  }, [keyword, scope, source, protocol, showHidden]);

  const selectedEndpoints = useMemo(
    () => endpoints.filter((endpoint) => selected.has(endpoint.id)),
    [selected, dataVersion],
  );

  const visibleIds = useMemo(() => visibleEndpoints.map((endpoint) => endpoint.id), [visibleEndpoints]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  useEffect(() => {
    const input = selectAllRef.current;
    if (!input) return;
    const count = visibleIds.filter((id) => selected.has(id)).length;
    input.indeterminate = count > 0 && count < visibleIds.length;
  }, [visibleIds, selected]);

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setKeyword("");
    setScope("ALL");
    setSource("ALL");
    setProtocol("ALL");
    setShowHidden(false);
  };

  const copySelection = async (mode: CopyMode) => {
    const targets = selected.size > 0 ? selectedEndpoints : visibleEndpoints;
    if (targets.length === 0) {
      push("没有可复制的端点", "warning");
      return;
    }

    const values = targets.map((endpoint) => {
      if (mode === "ip") return primaryIp(endpoint);
      if (mode === "url") return endpointUrl(endpoint);
      return endpointAddress(endpoint);
    });
    const unique = Array.from(new Set(values.filter((value) => value.length > 0)));
    const ok = await copyText(unique.join("\n"));
    const suffix = mode === "ip" ? "个 IP" : mode === "url" ? "个 URL" : "个 IP:Port";

    push(
      ok ? `已复制 ${unique.length} ${suffix}` : "浏览器阻止了剪贴板访问，请手动复制",
      ok ? "success" : "warning",
    );
  };

  const exportEndpoints = (targets: Endpoint[], suffix: string) => {
    if (targets.length === 0) {
      push("没有可导出的端点", "warning");
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`docklens-endpoints-${suffix}-${date}.json`, {
      exportedAt: new Date().toISOString(),
      total: targets.length,
      endpoints: targets.map((endpoint) =>
        exportRecord(endpoint, isHidden(endpoint), isFavorite(endpoint)),
      ),
    });
    push(`已导出 ${targets.length} 个端点`);
  };

  const toggleFavorite = (id: string) => {
    const endpoint = endpoints.find((item) => item.id === id);
    if (!endpoint) return;
    const next = !(favoriteMap[id] ?? endpoint.favorite);
    setFavoriteMap((current) => ({ ...current, [id]: next }));
    void patchEndpoint(id, { favorite: next }).then((saved) => {
      if (!saved) push("已更新本地状态，服务端未保存", "warning");
    });
    push(`${next ? "已收藏" : "已取消收藏"} ${endpoint.service}`);
  };

  const toggleHidden = (id: string) => {
    const endpoint = endpoints.find((item) => item.id === id);
    if (!endpoint) return;
    const next = !(hiddenMap[id] ?? endpoint.hidden);
    setHiddenMap((current) => ({ ...current, [id]: next }));
    void patchEndpoint(id, { hidden: next }).then((saved) => {
      if (!saved) push("已更新本地状态，服务端未保存", "warning");
    });
    push(`${next ? "已隐藏" : "已取消隐藏"} ${endpoint.service}`);
  };

  const activeEndpoint = activeId
    ? endpoints.find((endpoint) => endpoint.id === activeId) ?? null
    : null;

  const exportTargets = selected.size > 0 ? selectedEndpoints : visibleEndpoints;
  const exportSuffix = selected.size > 0 ? "selected" : "filtered";
  const filterSummary = activeFilters.join(" · ");

  return (
    <div className={classNames("page ep-page", selected.size > 0 && "ep-page-selected")}>
      <header className="page-head">
        <div>
          <h1 className="page-title">端点</h1>
          <p className="page-subtitle">
            {endpoints.length} 个端点 · 显示 {visibleEndpoints.length}
            {hiddenCount > 0 && <> · 隐藏 {hiddenCount}</>}
          </p>
          {filterSummary && <div className="ep-filter-summary">{filterSummary}</div>}
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn"
            onClick={() => void copySelection("address")}
            disabled={exportTargets.length === 0}
            title="复制选中端点，未选中时复制当前结果"
          >
            <Copy size={14} /> 复制
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => exportEndpoints(exportTargets, exportSuffix)}
            disabled={exportTargets.length === 0}
            title="导出选中端点，未选中时导出当前结果"
          >
            <Download size={14} /> 导出
          </button>
        </div>
      </header>

      <div className="ep-toolbar">
        <div className="ep-toolbar-row">
          <div className="ep-search">
            <Search size={15} />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索服务、IP 或端口"
              aria-label="搜索端点"
            />
            {keyword && (
              <button
                type="button"
                className="ep-search-clear"
                aria-label="清除搜索"
                title="清除搜索"
                onClick={() => setKeyword("")}
              >
                <X size={14} />
              </button>
            )}
            <button
              type="button"
              className="ep-search-help"
              aria-label="搜索语法"
              title=":8080 端口 · ip: 前缀 · net: 网络 · tag: 标签 · proto: · source: · scope: · hidden:true"
            >
              <CircleHelp size={14} />
            </button>
          </div>
          <div className="segmented ep-view-toggle" role="group" aria-label="视图切换">
            <button
              type="button"
              className={classNames(view === "table" && "is-active")}
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
            >
              <List size={13} /> 表格
            </button>
            <button
              type="button"
              className={classNames(view === "cards" && "is-active")}
              aria-pressed={view === "cards"}
              onClick={() => setView("cards")}
            >
              <LayoutGrid size={13} /> 卡片
            </button>
          </div>
        </div>

        <div className="ep-toolbar-row ep-filters">
          <div className="ep-filter-group">
            <span className="ep-filter-label">范围</span>
            {scopeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={classNames("chip", scope === option.value && "is-active")}
                aria-pressed={scope === option.value}
                onClick={() => setScope(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="ep-filter-group">
            <span className="ep-filter-label">来源</span>
            {sourceOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={classNames("chip", source === option.value && "is-active")}
                aria-pressed={source === option.value}
                onClick={() => setSource(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="ep-filter-group">
            <span className="ep-filter-label">协议</span>
            {protocolOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={classNames("chip", protocol === option.value && "is-active")}
                aria-pressed={protocol === option.value}
                onClick={() => setProtocol(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={classNames("chip", showHidden && "is-active")}
            aria-pressed={showHidden}
            onClick={() => setShowHidden((value) => !value)}
          >
            <Eye size={12} /> 显示隐藏
          </button>

          {activeFilters.length > 0 && (
            <button type="button" className="chip" onClick={clearFilters} title="清除全部筛选">
              <RotateCcw size={12} /> 重置
            </button>
          )}
        </div>
      </div>

      {visibleEndpoints.length === 0 ? (
        <div className="holo-card ep-empty-wrap">
          <EmptyState
            title="无匹配端点"
            description="调整搜索条件或清除筛选。"
            action={
              <button type="button" className="btn btn-sm" onClick={clearFilters}>
                清除筛选
              </button>
            }
          />
        </div>
      ) : view === "table" ? (
        <div className="table-wrap ep-table-wrap">
          <table className="data-table ep-table">
            <thead>
              <tr>
                <th className="ep-col-select">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="ep-checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="选择全部可见端点"
                  />
                </th>
                <th>状态</th>
                <th>服务 / 容器</th>
                <th>来源</th>
                <th>网络</th>
                <th>IP</th>
                <th>端口映射</th>
                <th>协议</th>
                <th>地址</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleEndpoints.map((endpoint) => {
                const hidden = isHidden(endpoint);
                const favorite = isFavorite(endpoint);
                const status = displayStatus(endpoint, hidden);
                const network = getNetwork(endpoint);
                const address = endpointAddress(endpoint);
                const url = endpointUrl(endpoint);
                const selectedRow = selected.has(endpoint.id);

                return (
                  <tr
                    key={endpoint.id}
                    className={classNames(
                      hidden && "is-hidden-row",
                      selectedRow && "is-selected",
                    )}
                  >
                    <td className="ep-col-select">
                      <input
                        type="checkbox"
                        className="ep-checkbox"
                        checked={selectedRow}
                        onChange={() => toggleSelected(endpoint.id)}
                        aria-label={`选择 ${endpoint.service}`}
                      />
                    </td>
                    <td>
                      <span className="ep-status">
                        <StatusDot status={status.dot} pulse={status.dot === "running"} />
                        <span>{status.label}</span>
                      </span>
                    </td>
                    <td>
                      <div className="cell-service">
                        <span className="service-mark">{endpoint.service.slice(0, 1)}</span>
                        <div className="service-copy">
                          <strong>{endpoint.service}</strong>
                          <span title={`${endpoint.container} · ${endpoint.image}`}>
                            {endpoint.container !== "—" ? endpoint.container : endpoint.image}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="ep-source-cell">
                        <Badge tone={sourceTone[endpoint.source]} dot>
                          {sourceLabels[endpoint.source]}
                        </Badge>
                        <span className="ep-scope-hint">{scopeLabels[endpoint.scope]}</span>
                      </div>
                    </td>
                    <td>
                      <div className="ep-net-cell">
                        <span className="mono">{endpoint.network}</span>
                        {network && <span className="ep-net-sub">{network.driver}</span>}
                      </div>
                    </td>
                    <td>
                      <div className="ip-list">
                        <span className="ip-primary">{primaryIp(endpoint)}</span>
                        {endpoint.accessIps && endpoint.accessIps.length > 1 && (
                          <span className="ip-secondary" title="查看全部访问地址">
                            {endpoint.accessIps.length} 个地址
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="port-map">
                        <strong>{endpoint.port}</strong>
                        <em>→</em>
                        <span>
                          {endpoint.containerPort ?? "—"}/{endpoint.protocol}
                        </span>
                      </span>
                    </td>
                    <td>
                      <Badge tone={protocolTone[endpoint.protocol]}>
                        {endpoint.protocol.toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      <CopyButton
                        value={address}
                        variant="chip"
                        className="ep-address-copy"
                        toast={`已复制 ${address}`}
                      >
                        {address}
                      </CopyButton>
                    </td>
                    <td>
                      <div className="row-actions ep-row-actions">
                        <CopyButton
                          value={address}
                          variant="ghost"
                          iconOnly
                          title="复制端点"
                          toast={`已复制 ${address}`}
                        />
                        <a
                          className="icon-btn"
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`打开 ${endpoint.service}`}
                          title="打开 URL"
                        >
                          <ExternalLink size={15} />
                        </a>
                        <button
                          type="button"
                          className={classNames("icon-btn", favorite && "ep-icon-active")}
                          aria-label={favorite ? "取消收藏" : "收藏端点"}
                          aria-pressed={favorite}
                          title={favorite ? "取消收藏" : "收藏"}
                          onClick={() => toggleFavorite(endpoint.id)}
                        >
                          <Star size={15} fill={favorite ? "currentColor" : "none"} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={hidden ? "取消隐藏" : "隐藏端点"}
                          aria-pressed={hidden}
                          title={hidden ? "取消隐藏" : "隐藏"}
                          onClick={() => toggleHidden(endpoint.id)}
                        >
                          {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="查看详情"
                          title="查看详情"
                          onClick={() => setActiveId(endpoint.id)}
                        >
                          <PanelRight size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ep-card-grid">
          {visibleEndpoints.map((endpoint) => {
            const hidden = isHidden(endpoint);
            const favorite = isFavorite(endpoint);
            const status = displayStatus(endpoint, hidden);
            const address = endpointAddress(endpoint);
            const url = endpointUrl(endpoint);
            const selectedRow = selected.has(endpoint.id);

            return (
              <article
                key={endpoint.id}
                className={classNames(
                  "ep-card",
                  hidden && "is-hidden-row",
                  selectedRow && "is-selected",
                )}
              >
                <div className="ep-card-head">
                  <input
                    type="checkbox"
                    className="ep-checkbox"
                    checked={selectedRow}
                    onChange={() => toggleSelected(endpoint.id)}
                    aria-label={`选择 ${endpoint.service}`}
                  />
                  <span className="service-mark">{endpoint.service.slice(0, 1)}</span>
                  <div className="ep-card-title">
                    <strong>{endpoint.service}</strong>
                    <span title={`${endpoint.container} · ${endpoint.image}`}>
                      {endpoint.container !== "—" ? endpoint.container : endpoint.image}
                    </span>
                  </div>
                </div>

                <div className="ep-card-address">
                  <span>{address}</span>
                  <CopyButton
                    value={address}
                    variant="ghost"
                    iconOnly
                    title="复制端点"
                    toast={`已复制 ${address}`}
                  />
                </div>

                <div className="ep-card-badges">
                  <Badge tone={sourceTone[endpoint.source]} dot>
                    {sourceLabels[endpoint.source]}
                  </Badge>
                  <Badge tone="blue">{scopeLabels[endpoint.scope]}</Badge>
                  <Badge tone={protocolTone[endpoint.protocol]}>
                    {endpoint.protocol.toUpperCase()}
                  </Badge>
                  <span className="ep-status">
                    <StatusDot status={status.dot} />
                    <span>{status.label}</span>
                  </span>
                </div>

                {endpoint.tags.length > 0 && (
                  <div
                    className="ep-card-tags"
                    title={endpoint.tags.map((tag) => `#${tag}`).join(" · ")}
                  >
                    {endpoint.tags.slice(0, 3).map((tag) => (
                      <span className="ep-tag" key={tag}>
                        #{tag}
                      </span>
                    ))}
                    {endpoint.tags.length > 3 && (
                      <span className="ep-tag ep-tag-more">+{endpoint.tags.length - 3}</span>
                    )}
                  </div>
                )}

                <div className="ep-card-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setActiveId(endpoint.id)}
                  >
                    <PanelRight size={13} /> 详情
                  </button>
                  <a className="btn btn-sm" href={url} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> 打开
                  </a>
                  <button
                    type="button"
                    className={classNames("icon-btn", favorite && "ep-icon-active")}
                    aria-label={favorite ? "取消收藏" : "收藏端点"}
                    aria-pressed={favorite}
                    title={favorite ? "取消收藏" : "收藏"}
                    onClick={() => toggleFavorite(endpoint.id)}
                  >
                    <Star size={15} fill={favorite ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={hidden ? "取消隐藏" : "隐藏端点"}
                    aria-pressed={hidden}
                    title={hidden ? "取消隐藏" : "隐藏"}
                    onClick={() => toggleHidden(endpoint.id)}
                  >
                    {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="ep-bulk-bar" role="region" aria-label="批量操作">
          <div className="ep-bulk-count">
            <CheckCheck size={14} /> 已选 <strong>{selected.size}</strong>
          </div>
          <button
            type="button"
            className="copy-btn"
            onClick={() => void copySelection("ip")}
            title="复制选中端点的 IP"
          >
            <Copy size={13} />
            <span>复制 IP</span>
          </button>
          <button
            type="button"
            className="copy-btn"
            onClick={() => void copySelection("address")}
            title="复制选中端点的 IP:Port"
          >
            <Copy size={13} />
            <span>复制端点</span>
          </button>
          <button
            type="button"
            className="copy-btn"
            onClick={() => void copySelection("url")}
            title="复制选中端点的 URL"
          >
            <Copy size={13} />
            <span>复制 URL</span>
          </button>
          <button
            type="button"
            className="copy-btn"
            onClick={() => exportEndpoints(selectedEndpoints, "selected")}
            title="导出选中端点为 JSON"
          >
            <Download size={13} />
            <span>导出</span>
          </button>
          <button
            type="button"
            className="copy-btn"
            onClick={() => setSelected(new Set())}
            title="清除选择"
          >
            <X size={13} />
            <span>清除</span>
          </button>
        </div>
      )}

      {activeEndpoint && (
        <EndpointDrawer
          endpoint={activeEndpoint}
          network={getNetwork(activeEndpoint)}
          hidden={isHidden(activeEndpoint)}
          favorite={isFavorite(activeEndpoint)}
          onClose={() => setActiveId(null)}
          onToggleFavorite={() => toggleFavorite(activeEndpoint.id)}
          onToggleHidden={() => toggleHidden(activeEndpoint.id)}
        />
      )}
    </div>
  );
}
