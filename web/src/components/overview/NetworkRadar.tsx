import type { Endpoint } from "../../types";
import { HoloCard } from "../ui/HoloCard";

const SIZE = 360;
const CENTER = SIZE / 2;
const MAX_RADIUS = 156;
const RINGS = [44, 82, 120, 156];
const DIAGONAL = MAX_RADIUS * Math.SQRT1_2;
const SWEEP_X = CENTER + MAX_RADIUS * Math.sin(Math.PI / 4);
const SWEEP_Y = CENTER - MAX_RADIUS * Math.cos(Math.PI / 4);

const scopeTone: Record<Endpoint["scope"], string> = {
  HOST: "host",
  HOST_NET: "hostnet",
  LAN: "lan",
  CONTAINER: "container",
  OVERLAY: "overlay",
  LOOPBACK: "muted",
  EXTERNAL: "external",
};

const legendItems = [
  { tone: "host", label: "宿主机" },
  { tone: "hostnet", label: "host 网络" },
  { tone: "lan", label: "局域网" },
  { tone: "container", label: "容器内" },
  { tone: "stale", label: "最后已知" },
  { tone: "danger", label: "端口冲突" },
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function dotPoint(endpoint: Endpoint, index: number) {
  const seed = hashString(endpoint.id);
  const angle = (index * 137.508 + (seed % 47)) * (Math.PI / 180);
  const radial = 34 + (((seed >>> 11) % 1000) / 1000) * (MAX_RADIUS - 34);
  return {
    x: CENTER + Math.cos(angle) * radial,
    y: CENTER + Math.sin(angle) * radial,
  };
}

function conflictIds(endpoints: Endpoint[]): Set<string> {
  const groups = new Map<string, Endpoint[]>();
  for (const endpoint of endpoints) {
    if (endpoint.hidden) continue;
    const key = `${endpoint.ip}:${endpoint.port}/${endpoint.protocol}`;
    groups.set(key, [...(groups.get(key) ?? []), endpoint]);
  }
  const ids = new Set<string>();
  for (const group of groups.values()) {
    if (new Set(group.map((endpoint) => endpoint.service)).size > 1) {
      group.forEach((endpoint) => ids.add(endpoint.id));
    }
  }
  return ids;
}

interface NetworkRadarProps {
  endpoints: Endpoint[];
}

export function NetworkRadar({ endpoints }: NetworkRadarProps) {
  const conflicts = conflictIds(endpoints);
  const counts = new Map<string, number>();
  const scopes = new Set<Endpoint["scope"]>();

  for (const endpoint of endpoints) {
    scopes.add(endpoint.scope);
    const tone =
      endpoint.status === "stale"
        ? "stale"
        : endpoint.hidden || endpoint.status === "hidden"
          ? "muted"
          : conflicts.has(endpoint.id)
            ? "danger"
            : scopeTone[endpoint.scope];
    counts.set(tone, (counts.get(tone) ?? 0) + 1);
  }

  return (
    <HoloCard className="ov-radar-card">
      <div className="ov-panel-head">
        <div>
          <h2 className="ov-panel-title" title="按作用域与状态抽样展示，位置不代表真实拓扑">
            端点雷达
          </h2>
        </div>
      </div>

      <div className="ov-radar-stage">
        <svg
          className="ov-radar-svg"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`端点雷达，展示 ${endpoints.length} 个端点，覆盖 ${scopes.size} 种作用域`}
        >
          <defs>
            <radialGradient id="ov-radar-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="ov-radar-sweep" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          <circle cx={CENTER} cy={CENTER} r={MAX_RADIUS} fill="url(#ov-radar-core)" />

          {RINGS.map((radius) => (
            <circle
              key={radius}
              cx={CENTER}
              cy={CENTER}
              r={radius}
              className={`ov-radar-ring ${radius === MAX_RADIUS ? "is-outer" : ""}`}
            />
          ))}

          <line x1={CENTER} y1={CENTER - MAX_RADIUS} x2={CENTER} y2={CENTER + MAX_RADIUS} className="ov-radar-axis" />
          <line x1={CENTER - MAX_RADIUS} y1={CENTER} x2={CENTER + MAX_RADIUS} y2={CENTER} className="ov-radar-axis" />
          <line
            x1={CENTER - DIAGONAL}
            y1={CENTER - DIAGONAL}
            x2={CENTER + DIAGONAL}
            y2={CENTER + DIAGONAL}
            className="ov-radar-axis is-faint"
          />
          <line
            x1={CENTER - DIAGONAL}
            y1={CENTER + DIAGONAL}
            x2={CENTER + DIAGONAL}
            y2={CENTER - DIAGONAL}
            className="ov-radar-axis is-faint"
          />

          <g className="ov-radar-sweep">
            <path
              d={`M ${CENTER} ${CENTER} L ${CENTER} ${CENTER - MAX_RADIUS} A ${MAX_RADIUS} ${MAX_RADIUS} 0 0 1 ${SWEEP_X} ${SWEEP_Y} Z`}
              fill="url(#ov-radar-sweep)"
            />
            <line
              x1={CENTER}
              y1={CENTER}
              x2={CENTER}
              y2={CENTER - MAX_RADIUS}
              className="ov-radar-sweep-line"
            />
          </g>

          {endpoints.map((endpoint, index) => {
            const point = dotPoint(endpoint, index);
            const tone =
              endpoint.status === "stale"
                ? "stale"
                : endpoint.hidden || endpoint.status === "hidden"
                  ? "muted"
                  : conflicts.has(endpoint.id)
                    ? "danger"
                    : scopeTone[endpoint.scope];
            const muted = tone === "muted";
            return (
              <g key={endpoint.id}>
                {tone === "danger" && (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={5}
                    className="ov-radar-ping"
                    style={{ transformOrigin: `${point.x}px ${point.y}px` }}
                  />
                )}
                <circle cx={point.x} cy={point.y} r={muted ? 2.2 : 3.2} className={`ov-radar-dot ov-radar-dot--${tone}`}>
                  <title>{`${endpoint.service} · ${endpoint.ip}:${endpoint.port}/${endpoint.protocol}`}</title>
                </circle>
              </g>
            );
          })}

          <circle cx={CENTER} cy={CENTER} r={9} className="ov-radar-core-ring" />
          <circle cx={CENTER} cy={CENTER} r={3.5} className="ov-radar-core-dot" />
        </svg>
      </div>

      <div className="ov-radar-legend">
        {legendItems.map((item) => (
          <span key={item.tone} className="ov-legend-item">
            <span className={`ov-legend-dot ov-legend-dot--${item.tone}`} />
            {item.label}
            <span className="ov-legend-count mono">{counts.get(item.tone) ?? 0}</span>
          </span>
        ))}
      </div>
    </HoloCard>
  );
}
