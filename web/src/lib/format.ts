import type { Endpoint, EndpointScope, EndpointSource, EndpointStatus } from "../types";

export const scopeLabels: Record<EndpointScope, string> = {
  HOST: "宿主机",
  CONTAINER: "容器内",
  LAN: "局域网",
  OVERLAY: "Overlay",
  LOOPBACK: "回环",
  HOST_NET: "host 网络",
  EXTERNAL: "外部",
};

export const sourceLabels: Record<EndpointSource, string> = {
  PUBLISHED: "发布映射",
  HOST_LISTENER: "宿主监听",
  EXPOSED: "内部声明",
  PROXY_LABEL: "反向代理",
  INFERRED: "推断",
  MANUAL: "手动",
};

export const statusLabels: Record<EndpointStatus, string> = {
  running: "运行中",
  stale: "最后已知",
  hidden: "已隐藏",
};

export function primaryIp(endpoint: Endpoint): string {
  const preferred = endpoint.accessIps?.find((item) => item.preferred);
  if (preferred) return preferred.ip;
  if (endpoint.accessIps?.length) return endpoint.accessIps[0].ip;
  if (endpoint.ip === "0.0.0.0" || endpoint.ip === "::") return "192.168.1.20";
  return endpoint.ip;
}

export function endpointAddress(endpoint: Endpoint): string {
  const ip = primaryIp(endpoint);
  const host = ip.includes(":") ? `[${ip}]` : ip;
  return `${host}:${endpoint.port}`;
}

export function endpointUrl(endpoint: Endpoint): string {
  if (endpoint.url) return endpoint.url;
  const scheme = [443, 8443, 9443].includes(endpoint.port) ? "https" : "http";
  return `${scheme}://${endpointAddress(endpoint)}`;
}

export function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
