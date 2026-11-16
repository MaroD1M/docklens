import { useMemo, useState, type ReactNode } from "react";
import { useDataVersion } from "../../data/DataProvider";
import { Braces, Code2, FileJson, Link2, ListChecks, Table2, Waypoints } from "lucide-react";
import { endpoints } from "../../data/mock";
import { endpointAddress, endpointUrl, primaryIp, sourceLabels } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { HoloCard } from "../ui/HoloCard";
import { SectionHeader } from "../ui/SectionHeader";

type FormatKey = "ip" | "address" | "url" | "markdown" | "json" | "compose";

interface FormatItem {
  key: FormatKey;
  label: string;
  description: string;
  icon: ReactNode;
  value: string;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

export function BatchCopyCenter() {
  const dataVersion = useDataVersion();
  const [selectedKey, setSelectedKey] = useState<FormatKey>("address");

  const formats = useMemo<FormatItem[]>(() => {
    const ipList = Array.from(new Set(endpoints.map((endpoint) => primaryIp(endpoint)))).join("\n");
    const addressList = endpoints.map((endpoint) => endpointAddress(endpoint)).join("\n");
    const urlList = endpoints.map((endpoint) => endpointUrl(endpoint)).join("\n");

    const markdown = [
      "| 服务 | 网络 | 地址 | 协议 | 来源 |",
      "| --- | --- | --- | --- | --- |",
      ...endpoints.map(
        (endpoint) =>
          `| ${escapeCell(endpoint.service)} | ${escapeCell(endpoint.network)} | ${endpointAddress(
            endpoint,
          )} | ${endpoint.protocol} | ${sourceLabels[endpoint.source]} |`,
      ),
    ].join("\n");

    const json = JSON.stringify(
      endpoints.map((endpoint) => ({
        service: endpoint.service,
        container: endpoint.container,
        image: endpoint.image,
        network: endpoint.network,
        scope: endpoint.scope,
        source: endpoint.source,
        ip: primaryIp(endpoint),
        port: endpoint.port,
        protocol: endpoint.protocol,
        containerPort: endpoint.containerPort ?? null,
        url: endpointUrl(endpoint),
      })),
      null,
      2,
    );

    const composeLines = endpoints
      .filter((endpoint) => endpoint.containerPort)
      .map(
        (endpoint) =>
          `  - "${endpoint.port}:${endpoint.containerPort}/${endpoint.protocol}"  # ${endpoint.service}`,
      );
    const compose = ["# DockLens 端口映射", "ports:", ...composeLines].join("\n");

    return [
      {
        key: "ip",
        label: "IP 列表",
        description: "去重首选 IP",
        icon: <ListChecks size={15} />,
        value: ipList,
      },
      {
        key: "address",
        label: "IP:Port 列表",
        description: "每行一个地址",
        icon: <Waypoints size={15} />,
        value: addressList,
      },
      {
        key: "url",
        label: "URL 列表",
        description: "可打开链接",
        icon: <Link2 size={15} />,
        value: urlList,
      },
      {
        key: "markdown",
        label: "Markdown 表格",
        description: "文档表格",
        icon: <Table2 size={15} />,
        value: markdown,
      },
      {
        key: "json",
        label: "JSON",
        description: "精简字段",
        icon: <FileJson size={15} />,
        value: json,
      },
      {
        key: "compose",
        label: "Compose ports",
        description: "端口映射",
        icon: <Code2 size={15} />,
        value: compose,
      },
    ];
  }, [dataVersion]);

  const selected = formats.find((format) => format.key === selectedKey) ?? formats[0];

  return (
    <HoloCard className="tools-card tools-batch">
      <SectionHeader
        title="批量复制"
        action={
          <Badge tone="cyan" dot>
            {endpoints.length} 个端点
          </Badge>
        }
      />

      <div className="tools-format-grid">
        {formats.map((format) => (
          <div
            key={format.key}
            className={`tools-format-card ${selectedKey === format.key ? "is-active" : ""}`}
          >
            <button
              type="button"
              className="tools-format-select"
              aria-pressed={selectedKey === format.key}
              onClick={() => setSelectedKey(format.key)}
            >
              <span className="tools-format-icon" aria-hidden="true">
                {format.icon}
              </span>
              <span className="tools-format-copy">
                <strong>{format.label}</strong>
                <span>{format.description}</span>
              </span>
            </button>
            <CopyButton
              value={format.value}
              label="复制"
              variant="chip"
              toast={`已复制${format.label}`}
            />
          </div>
        ))}
      </div>

      <div className="tools-preview">
        <div className="tools-preview-head">
          <strong>{selected.label}</strong>
          <CopyButton
            value={selected.value}
            label="复制"
            variant="solid"
            toast={`已复制${selected.label}`}
          />
        </div>
        <pre className="tools-pre" aria-label={`${selected.label}预览`}>
          {selected.value}
        </pre>
      </div>

      <p className="tools-hint tools-preview-note">
        <Braces size={12} aria-hidden="true" /> 含隐藏与过期端点。
      </p>
    </HoloCard>
  );
}
