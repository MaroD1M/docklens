import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Command,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Sun,
} from "lucide-react";
import { containers, endpoints } from "../../data/mock";
import { applyTheme, getTheme } from "../../lib/theme";
import { requestRefresh } from "../../lib/api";

const pageNames: Record<string, string> = {
  "/": "总览",
  "/endpoints": "端点",
  "/ports": "端口",
  "/networks": "网络",
  "/topology": "拓扑",
  "/tools": "工具",
  "/settings": "设置",
};

interface TopBarProps {
  onMenu: () => void;
}

export function TopBar({ onMenu }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const pageName = pageNames[location.pathname] ?? "总览";
  const [query, setQuery] = useState("");
  const [countdown, setCountdown] = useState(9);
  const [scanning, setScanning] = useState(false);
  const [dark, setDark] = useState(() => getTheme() === "dark");
  const [source, setSource] = useState<"live" | "mock">("mock");
  const timer = useRef<number | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCountdown((current) => (current <= 1 ? 30 : current - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (countdown === 1 && source === "live") {
      void requestRefresh();
    }
  }, [countdown, source]);

  useEffect(() => {
    const syncTheme = (event: Event) => {
      const theme = (event as CustomEvent<string>).detail;
      setDark(theme !== "light");
    };
    const syncSource = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      setSource(value === "live" ? "live" : "mock");
    };
    window.addEventListener("docklens:theme", syncTheme);
    window.addEventListener("docklens:source", syncSource);
    return () => {
      window.removeEventListener("docklens:theme", syncTheme);
      window.removeEventListener("docklens:source", syncSource);
    };
  }, []);

  useEffect(() => {
    applyTheme(dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const refresh = () => {
    setScanning(true);
    void requestRefresh();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setScanning(false), 1300);
    setCountdown(30);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/endpoints?q=${encodeURIComponent(value)}` : "/endpoints");
  };

  return (
    <header className={`topbar ${scanning ? "is-scanning" : ""}`}>
      <div className="topbar-left">
        <button type="button" className="icon-btn mobile-menu" aria-label="打开导航" onClick={onMenu}>
          <Menu size={18} />
        </button>
        <div className="breadcrumb">
          <span>DockLens</span>
          <ChevronRight size={13} />
          <strong>{pageName}</strong>
        </div>
        <div className="scan-status">
          <span className={`status-dot ${source === "live" ? "status-running" : "status-stale"} status-pulse`} />
          <span>{source === "live" ? "实时" : "演示"}</span>
          <span className="scan-status-divider" />
          <span className="mono">{containers.length} 容器 / {endpoints.length} 端点</span>
        </div>
      </div>

      <form className="global-search" onSubmit={submit}>
        <Search size={16} />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索容器、IP 或端口"
          aria-label="搜索容器、IP 或端口"
        />
        <kbd>
          <Command size={11} /> K
        </kbd>
      </form>

      <div className="topbar-right">
        <div className="refresh-meta">
          <span className="mono">{scanning ? "扫描中" : `${countdown}s`}</span>
          <button
            type="button"
            className={`icon-btn ${scanning ? "is-spinning" : ""}`}
            aria-label="刷新"
            onClick={refresh}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={dark ? "切换浅色模式" : "切换深色模式"}
          onClick={() => setDark((value) => !value)}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
      <div className="scan-line" />
    </header>
  );
}
