import type { NetworkInfo } from "../../types";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { HoloCard } from "../ui/HoloCard";
import { SectionHeader } from "../ui/SectionHeader";
import { IpPool } from "./IpPool";
import { ipKindLabels } from "./networkUtils";

type BadgeTone = "cyan" | "blue" | "green" | "amber" | "red" | "muted" | "violet";

interface NetworkDetailProps {
  network: NetworkInfo;
}

function kindTone(kind: NetworkInfo["usedIps"][number]["kind"]): BadgeTone {
  if (kind === "container") return "green";
  if (kind === "gateway") return "cyan";
  if (kind === "host") return "amber";
  return "violet";
}

export function NetworkDetail({ network }: NetworkDetailProps) {
  const usedIps = Array.from(new Set(network.usedIps.map((entry) => entry.ip)));
  const sharedHostIp = network.usedIps.find((entry) => entry.kind === "host")?.ip;

  return (
    <HoloCard className="net-detail" as="section">
      <SectionHeader
        eyebrow="当前网络"
        title={network.name}
        subtitle={`${network.driver} · ${network.scope} · ${network.subnet}`}
        action={
          <div className="net-detail-actions">
            <CopyButton
              value={network.subnet}
              label="复制 CIDR"
              variant="solid"
              toast={`已复制 ${network.subnet}`}
            />
            <CopyButton
              value={usedIps.join("\n")}
              label="复制已用 IP"
              variant="ghost"
              title="复制已用 IP"
              toast={`已复制 ${usedIps.length} 个 IP`}
            />
          </div>
        }
      />

      {(network.driver === "host" || network.name === "host") && (
        <div className="net-host-note">
          <strong>host 网络</strong>
          <p>
            容器共享宿主机 IP{sharedHostIp ? ` ${sharedHostIp}` : ""}，同一 IP 可对应多个容器。
          </p>
        </div>
      )}

      <IpPool network={network} />

      <div className="net-used-head">
        <h3>已用 IP</h3>
        <span>
          {network.usedIps.length} 条 · {usedIps.length} 个唯一 IP
        </span>
      </div>

      <div className="table-wrap net-table-wrap">
        <table className="data-table net-ip-table">
          <thead>
            <tr>
              <th scope="col">IP</th>
              <th scope="col">类型</th>
              <th scope="col">容器</th>
              <th scope="col">别名</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {network.usedIps.length === 0 ? (
              <tr>
                <td colSpan={5} className="net-table-empty">
                  暂无已用 IP。
                </td>
              </tr>
            ) : (
              network.usedIps.map((entry, index) => (
                <tr key={`${entry.ip}-${entry.kind}-${entry.container ?? "none"}-${index}`}>
                  <td>
                    <span className="ip-primary">{entry.ip}</span>
                  </td>
                  <td>
                    <Badge tone={kindTone(entry.kind)}>{ipKindLabels[entry.kind]}</Badge>
                  </td>
                  <td>{entry.container ?? "—"}</td>
                  <td className="net-alias-cell">{entry.aliases?.length ? entry.aliases.join(", ") : "—"}</td>
                  <td>
                    <div className="row-actions">
                      <CopyButton
                        value={entry.ip}
                        label="复制"
                        variant="chip"
                        iconOnly
                        title={`复制 IP ${entry.ip}`}
                        toast={`已复制 ${entry.ip}`}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </HoloCard>
  );
}
