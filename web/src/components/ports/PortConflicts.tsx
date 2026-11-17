import { useNavigate } from "react-router-dom";
import type { PortConflict } from "../../lib/conflicts";
import { Badge } from "../ui/Badge";
import { HoloCard } from "../ui/HoloCard";

interface PortConflictsProps {
  conflicts: PortConflict[];
  onJump: (port: number, protocol: "tcp" | "udp") => void;
}

export function PortConflicts({ conflicts, onJump }: PortConflictsProps) {
  const navigate = useNavigate();

  return (
    <HoloCard
      className="ports-conflicts"
      as="section"
      glow={conflicts.length ? "danger" : "none"}
    >
      <div className="ports-conflicts-head">
        <div>
          <h2 className="section-title">端口冲突</h2>
          <p className="section-subtitle">全端口范围扫描，不受矩阵窗口限制</p>
        </div>
        <Badge tone={conflicts.length ? "red" : "green"} dot>
          {conflicts.length ? `${conflicts.length} 处` : "无冲突"}
        </Badge>
      </div>

      {conflicts.length === 0 ? (
        <p className="ports-conflicts-empty">当前端点数据中未发现端口冲突。</p>
      ) : (
        <ul className="ports-conflict-list" aria-label="端口冲突列表">
          {conflicts.map((conflict) => (
            <li key={conflict.key} className="ports-conflict-item">
              <div className="ports-conflict-main">
                <div className="ports-conflict-port mono">
                  {conflict.port}
                  <span>/{conflict.protocol}</span>
                </div>
                <div className="ports-conflict-services">{conflict.services.join(" / ")}</div>
                <div className="ports-conflict-endpoints">{conflict.endpoints.length} 个端点</div>
              </div>
              <div className="ports-conflict-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    onJump(
                      conflict.port,
                      conflict.protocol === "udp" ? "udp" : "tcp",
                    )
                  }
                  title={`在矩阵中定位 ${conflict.port}/${conflict.protocol}`}
                >
                  定位矩阵
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() =>
                    navigate(
                      `/endpoints?q=${encodeURIComponent(`:${conflict.port} proto:${conflict.protocol} hidden:true`)}`,
                    )
                  }
                  title={`查看 ${conflict.port}/${conflict.protocol} 的端点`}
                >
                  查看端点
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </HoloCard>
  );
}
