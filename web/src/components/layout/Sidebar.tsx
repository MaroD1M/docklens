import { NavLink } from "react-router-dom";
import {
  Activity,
  Boxes,
  Cable,
  LayoutDashboard,
  Network,
  Settings,
  Share2,
  Wrench,
  X,
} from "lucide-react";
import type { PageKey } from "../../types";
import { endpoints, networks } from "../../data/mock";
import { useHostInfo } from "../../data/DataProvider";

const navItems: { key: PageKey; to: string; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", to: "/", label: "总览", icon: LayoutDashboard },
  { key: "endpoints", to: "/endpoints", label: "端点", icon: Cable },
  { key: "ports", to: "/ports", label: "端口", icon: Activity },
  { key: "networks", to: "/networks", label: "网络", icon: Network },
  { key: "topology", to: "/topology", label: "拓扑", icon: Share2 },
  { key: "tools", to: "/tools", label: "工具", icon: Wrench },
  { key: "settings", to: "/settings", label: "设置", icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const host = useHostInfo();
  const hints: Partial<Record<PageKey, string>> = {
    endpoints: String(endpoints.length),
    networks: String(networks.length),
  };

  return (
    <>
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Boxes size={20} />
            <span className="brand-orbit" />
          </div>
          <div className="brand-copy">
            <strong>DOCKLENS</strong>
            <span>Docker 网络与端口</span>
          </div>
          <button type="button" className="icon-btn sidebar-close" aria-label="关闭导航" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="host-chip">
          <span className="host-pulse" />
          <div>
            <strong>{host.name}</strong>
            <span>
              {host.source === "live"
                ? host.dockerVersion
                  ? `Docker ${host.dockerVersion}`
                  : host.ip || "只读模式"
                : "演示数据"}
            </span>
          </div>
          <span className={`host-tag ${host.source === "mock" ? "is-mock" : ""}`}>{host.source === "live" ? "在线" : "演示"}</span>
        </div>

        <nav className="nav">
          <div className="nav-caption">导航</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
                onClick={onClose}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {hints[item.key] && <em>{hints[item.key]}</em>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="scan-orb">
            <span className="scan-orb-ring" />
            <span className="scan-orb-core" />
          </div>
          <div>
            <strong>扫描引擎</strong>
            <span>30 秒间隔</span>
          </div>
        </div>
      </aside>
      {open && <button type="button" className="sidebar-scrim" aria-label="关闭导航" onClick={onClose} />}
    </>
  );
}
