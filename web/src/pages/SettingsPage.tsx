import { useEffect, useState, type ReactNode } from "react";
import {
  Download,
  FolderOpen,
  Moon,
  Save,
  ShieldCheck,
  Sun,
  Upload,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { CopyButton } from "../components/ui/CopyButton";
import { HoloCard } from "../components/ui/HoloCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useToast } from "../components/ui/Toast";
import { applyTheme } from "../lib/theme";
import packageJson from "../../package.json";
import "../components/settings/settings.css";

type Theme = "dark" | "light";
type TableDensity = "comfortable" | "compact";

interface RuntimeInfo {
  version: string;
  docker: string;
  api: string;
  uptime: string;
  containers: string;
}

interface Settings {
  theme: Theme;
  animations: boolean;
  density: TableDensity;
}

const STORAGE_KEY = "docklens.settings.v1";

const defaultSettings: Settings = {
  theme: "dark",
  animations: true,
  density: "comfortable",
};

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      theme: data.theme === "light" ? "light" : "dark",
      animations: data.animations !== false,
      density: data.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return defaultSettings;
  }
}

interface ToggleRowProps {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  note?: string;
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
  note,
}: ToggleRowProps) {
  return (
    <div className={`settings-row ${disabled ? "is-disabled" : ""}`}>
      <div className="settings-row-copy">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
        {note && <em>{note}</em>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        className={`settings-switch ${checked ? "is-on" : ""}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="settings-switch-knob" />
      </button>
    </div>
  );
}

interface SecurityRowProps {
  title: string;
  description: string;
  badge: string;
  tone?: "green" | "amber" | "red" | "muted" | "cyan" | "blue" | "violet";
}

function SecurityRow({ title, description, badge, tone = "green" }: SecurityRowProps) {
  return (
    <div className="settings-security-row">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <Badge tone={tone} dot>
        {badge}
      </Badge>
    </div>
  );
}

interface AboutItemProps {
  label: string;
  value: ReactNode;
}

function AboutItem({ label, value }: AboutItemProps) {
  return (
    <div className="settings-about-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [runtime, setRuntime] = useState<RuntimeInfo>({
    version: packageJson.version,
    docker: "—",
    api: "—",
    uptime: "—",
    containers: "—",
  });
  const { push } = useToast();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [statusResponse, overviewResponse] = await Promise.all([
          fetch("/api/v1/status"),
          fetch("/api/v1/overview"),
        ]);
        if (!statusResponse.ok || !overviewResponse.ok) return;
        const status = await statusResponse.json();
        const overview = await overviewResponse.json();
        if (cancelled) return;
        setRuntime({
          version: status.version || packageJson.version,
          docker: overview.host?.dockerVersion || "—",
          api: overview.host?.apiVersion ? `v${overview.host.apiVersion}` : "—",
          uptime: status.uptime || "—",
          containers: overview.counts?.containers != null ? String(overview.counts.containers) : "—",
        });
      } catch {
        return;
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    applyTheme(settings.theme);
    root.dataset.motion = settings.animations ? "on" : "off";
    root.dataset.density = settings.density;
  }, [settings.theme, settings.animations, settings.density]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  const handleSave = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      void fetch("/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      }).catch(() => undefined);
      push("设置已保存");
    } catch {
      push("无法写入本地存储，请检查浏览器权限", "warning");
    }
  };

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: packageJson.version,
      settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "docklens-settings.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    push("设置已导出");
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">设置</h1>
          <p className="page-subtitle">本地偏好与运行状态</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            <Save size={14} />
            保存设置
          </button>
        </div>
      </header>

      <div className="settings-grid">
        <HoloCard className="settings-section">
          <SectionHeader title="外观" />

          <div className="settings-subblock">
            <div className="settings-label">主题</div>
            <div className="settings-theme-grid" role="group" aria-label="主题">
              <button
                type="button"
                className={`settings-theme ${settings.theme === "dark" ? "is-active" : ""}`}
                aria-pressed={settings.theme === "dark"}
                onClick={() => update("theme", "dark")}
              >
                <span className="settings-theme-preview settings-theme-preview-dark">
                  <Moon size={18} />
                </span>
                <span>
                  <strong>深色</strong>
                  <small>默认</small>
                </span>
              </button>
              <button
                type="button"
                className={`settings-theme ${settings.theme === "light" ? "is-active" : ""}`}
                aria-pressed={settings.theme === "light"}
                onClick={() => update("theme", "light")}
              >
                <span className="settings-theme-preview settings-theme-preview-light">
                  <Sun size={18} />
                </span>
                <span>
                  <strong>浅色</strong>
                  <small>低饱和</small>
                </span>
              </button>
            </div>
          </div>

          <ToggleRow
            title="界面动效"
            description="页面与图谱动效"
            checked={settings.animations}
            onChange={(value) => update("animations", value)}
          />

          <div className="settings-subblock">
            <div className="settings-label">表格密度</div>
            <div className="settings-inline">
              <div className="segmented" role="group" aria-label="表格密度">
                {(
                  [
                    ["comfortable", "舒适"],
                    ["compact", "紧凑"],
                  ] as Array<[TableDensity, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={settings.density === value ? "is-active" : ""}
                    aria-pressed={settings.density === value}
                    onClick={() => update("density", value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span
                className={`settings-density-preview is-${settings.density}`}
                aria-hidden="true"
              >
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        </HoloCard>

        <HoloCard className="settings-section">
          <SectionHeader title="安全" />

          <div className="settings-security-list">
            <SecurityRow title="只读模式" description="Docker 请求仅允许 GET" badge="已启用" />
            <SecurityRow
              title="Docker socket"
              description="只读方式挂载"
              badge="只读"
            />
            <SecurityRow title="遥测" description="不发送使用数据" badge="未启用" />
            <SecurityRow
              title="认证"
              description="未内置登录，仅限可信局域网"
              badge="未启用"
              tone="amber"
            />
          </div>
        </HoloCard>

        <HoloCard className="settings-section">
          <SectionHeader title="数据" />

          <div className="settings-action-list">
            <div className="settings-action-row">
              <div>
                <strong>导出设置 JSON</strong>
                <span>外观设置</span>
              </div>
              <button type="button" className="btn" onClick={handleExport}>
                <Download size={14} />
                导出
              </button>
            </div>
            <div className="settings-action-row">
              <div>
                <strong>导入设置</strong>
                <span>暂未开放</span>
              </div>
              <button type="button" className="btn" disabled>
                <Upload size={14} />
                导入
              </button>
            </div>
            <div className="settings-action-row">
              <div>
                <strong>数据目录</strong>
                <span>设置与元数据</span>
              </div>
              <div className="settings-dir">
                <FolderOpen size={13} />
                <code className="mono">/data</code>
                <CopyButton value="/data" label="复制" variant="chip" toast="已复制 /data" />
              </div>
            </div>
          </div>
        </HoloCard>

        <HoloCard className="settings-section">
          <SectionHeader title="关于" />

          <div className="settings-about-grid">
            <AboutItem label="版本" value={runtime.version} />
            <AboutItem label="Docker" value={runtime.docker} />
            <AboutItem label="API" value={runtime.api} />
            <AboutItem label="运行时长" value={runtime.uptime} />
            <AboutItem label="容器" value={runtime.containers} />
          </div>

          <div className="settings-about-foot">
            <ShieldCheck size={14} />
            <span>无外部数据库、遥测或外部请求</span>
          </div>
        </HoloCard>
      </div>
    </div>
  );
}
