# DockLens 完整设计文档

> 容器 IP / 端口 / 端点可视化面板  
> 版本：v1.2（GitHub 发布准备）  
> 日期：2026-11-16  
> 状态：待评审  
> 工作名：DockLens  
> 作者：MaroD1M  
> 仓库：https://github.com/MaroD1M/docklens

---

## 0. 决策摘要

| 项目 | 决策 |
|---|---|
| 技术栈 | Go + React |
| 能力范围 | 纯只读可视化，不提供容器启停/删除/Compose 编辑 |
| 部署形态 | 单机本地部署，优先适配个人群晖 NAS |
| 部署单元 | **单镜像、单容器**，后端、前端、采集、历史、认证、工具全部内置；不依赖 sidecar、Agent、外部数据库或缓存 |
| 多主机 | 首版不做，数据模型预留 `hostId`，不引入 Agent |
| 宿主监听 | 同一镜像的完整模式（host 网络 + pid host）可选开启，不额外部署容器 |
| 默认运行模式 | 简单模式：bridge 网络 + 只读 Docker socket；需要宿主非 Docker 端口时切换完整模式 |
| 安全模式 | 直接挂载 Docker socket，应用内部只读白名单；不强制 socket-proxy |
| 视觉方向 | 深空全息：深蓝黑底、全息青蓝、数据流光、玻璃质感 |
| 动效原则 | 动效服务于信息层级，不牺牲清晰度和性能 |
| 数据存储 | 本地 JSON 元数据 + 内存快照；无外部数据库，SQLite 作为后续可选 |
| 版本管理 | 根目录 `VERSION` 为单一版本源，部署通过 `DOCKLENS_VERSION` 使用 |
| 外部依赖 | 不联网、不遥测、不查公网 IP |
| 交付顺序 | 设计文档 → 可交互 UI 原型 → 工程骨架 → MVP |

### 修订记录

- v1.2：补充 GitHub 发布准备、作者信息、CI/GHCR 自动构建、预构建镜像部署和发布清单。
- v1.1：改为单镜像、单容器；移除 socket-proxy 与 host-agent 依赖，宿主监听并入同一容器的完整模式。
- v1.0：初版设计。

### 目标用户

个人群晖用户，DSM 7.x，Container Manager 部署 5–50 个容器。典型场景：

- 家里 NAS 上跑了媒体、下载、备份、网盘、智能家居等一堆服务。
- 记不住哪个服务占用了哪个端口，容器重建后 IP 又变了。
- 想快速复制 `192.168.1.20:8096` 发给家人，或粘到浏览器。
- 不想为了看端口再装一套重量级管理平台。
- 在意安全，不希望面板拥有启停容器的权限。

---

## 1. 背景与目标

### 1.1 问题

Docker 用户查看端口通常依赖：

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
docker inspect <container> | grep -i ip
```

问题在于：

- 端口、IP、容器、网络分散在不同命令和输出里。
- `0.0.0.0:8080->80/tcp` 不能直接复制成一个可访问地址。
- 一个容器可能有多个网络、多个 IP、IPv4 和 IPv6。
- 宿主机端口和容器内部端口容易混淆。
- 容器重建后 IP 变化，历史记录丢失。
- NAS 自带界面只展示端口映射，不展示访问地址和网络归属。

### 1.2 产品目标

1. 用一个页面看清所有容器的 **IP、端口、端点、网络归属**。
2. 任何 IP / `IP:Port` / URL 都能 **一键复制**。
3. 明确区分 **宿主机发布端口、容器内部端口、宿主机监听端口、推断端口**。
4. 对群晖环境开箱即用，部署简单，资源占用低。
5. 默认只读，最小权限，不向外部发送任何数据。
6. 界面有明确的科幻视觉语言，但信息密度和可读性优先。
7. **单容器交付**：一个镜像、一个容器、一个数据目录即可运行全部功能，不要求用户额外部署代理、数据库或缓存。

### 1.3 非目标

- 不做容器生命周期管理（启停、删除、重建）。
- 不做 Compose 编辑和部署。
- 不做多主机、集群、Swarm、Kubernetes 管理。
- 不做镜像更新、漏洞扫描、日志聚合。
- 不做公网资产测绘。
- 不做需要云服务的功能。

### 1.4 成功指标

| 指标 | 目标 |
|---|---|
| 首屏可交互 | < 1.5s（100 容器 / 500 端点） |
| 全量扫描 | < 2s |
| 发布端口识别准确率 | ≥ 99% |
| 内部端口识别准确率 | ≥ 95% |
| 复制成功率 | 100% |
| 峰值内存 | < 120MB |
| 镜像体积 | < 60MB |
| 部署容器数 | 1 |
| 只读模式 Docker 写操作 | 0 |
| 移动端可用 | 是 |

---

## 2. 竞品分析与取舍

| 项目 | 借鉴 | 不照搬 |
|---|---|---|
| DockPorts | 端口卡片、空隙卡片、隐藏端口、TCP/UDP、host 网络推断 | 以端口号为中心，IP 维度弱；单机 Flask 架构 |
| portracker | 实时发现、内部端口、宿主机监听、SQLite 单文件、层级分组 | 端口清单为主，缺少以“可复制端点”为核心的工作流 |
| dockpeek | 一键打开 Web UI、端口映射、Traefik 标签、多主机 | 偏快速访问，不是网络资产台账 |
| Atlas | 多网卡/多 IP、拓扑图、容器 IP/MAC、子网扫描 | 偏扫描和拓扑，较重，端口复制体验弱 |
| PortAuthority | 只读安全、端口占用检查、空闲端口推荐、来源区分 | 界面偏表格，缺少拓扑和子网视图 |
| Portainer / Dockge / Yacht | 容器详情、网络信息、Compose 项目识别 | 端口/IP 信息埋在详情里，不是核心工作流 |
| docker-port-viewer | 端口查找、iframe、自定义主机名 | 功能单一，缺少 IP/网络维度 |

### 差异化定位

**以 Endpoint 为中心，而不是以 Port 为中心。**

一个端点 = 协议 + IP + 端口 + 容器 + 网络 + 来源 + 可访问地址。

用户最终需要的是“我能访问的地址”，而不是一个孤立的端口号。

---

## 3. 产品原则

1. **端点优先**：所有视图围绕 Endpoint 组织。
2. **复制优先**：任何地址信息都应可复制，且复制结果与界面一致。
3. **来源透明**：每个端点标明来源和可信度，不把推断值伪装成事实。
4. **默认只读**：不提供任何写 Docker 的能力。
5. **本地优先**：无云依赖、无遥测、无外部请求。
6. **渐进披露**：列表给结论，抽屉给细节。
7. **动效克制**：动效解释状态变化，不制造噪音。
8. **清晰优先**：装饰层永远在数据层之后，不影响对比度和扫描效率。
9. **单容器交付**：所有能力打进一个镜像；不引入 sidecar、Agent、外部数据库，不把部署复杂度转嫁给用户。

---

## 4. 核心概念与信息架构

### 4.1 概念

| 概念 | 说明 |
|---|---|
| Host | 当前 NAS 主机，首版只有一个 |
| Network | Docker 网络，包含驱动、子网、网关 |
| Container | 运行中的容器，含 Compose 项目/服务标签 |
| Endpoint | 一个可访问或可识别的 `IP:Port/Protocol` |
| Endpoint Scope | 端点作用域：宿主机、容器内、局域网、Overlay 等 |
| Endpoint Source | 端点来源：发布映射、EXPOSE、宿主监听、反代标签、推断、手动 |
| IP Pool | 某个 Docker 子网的地址池，含已用/空闲/网关 |
| Service | Compose 项目下的服务，多个容器可属于同一服务 |

### 4.2 端点作用域

| Scope | 含义 | 示例 |
|---|---|---|
| `HOST` | 通过宿主机 IP 发布 | `192.168.1.20:8096` |
| `CONTAINER` | 容器网络内 IP | `172.18.0.5:80` |
| `LAN` | macvlan / ipvlan，容器直接拿局域网 IP | `192.168.1.50:80` |
| `OVERLAY` | Swarm overlay 网络 | `10.0.0.8:80` |
| `LOOPBACK` | 仅本机回环 | `127.0.0.1:8080` |
| `HOST_NET` | host 网络容器，端口即宿主机端口 | `192.168.1.20:9000` |
| `EXTERNAL` | 手动添加的域名或外部地址 | `https://media.example.com` |

### 4.3 端点来源与可信度

| Source | 可信度 | 说明 |
|---|---|---|
| `PUBLISHED` | 100 | Docker 端口映射，事实 |
| `HOST_LISTENER` | 90 | 宿主机 `ss` / `/proc/net` 监听 |
| `EXPOSED` | 80 | Dockerfile `EXPOSE` 或 Compose `expose`，只代表声明 |
| `PROXY_LABEL` | 70 | Traefik / Caddy 等标签推导 |
| `INFERRED` | 50 | 从命令、环境变量、健康检查推断 |
| `MANUAL` | 100 | 用户手动添加 |

界面规则：

- 100/90：实线卡片。
- 80：正常展示，标注“内部”。
- 70：正常展示，标注“反代”。
- 50：虚线边框 + “推断”标签，可隐藏。
- 多来源：显示主来源，详情里列出全部来源。

### 4.4 信息架构

```
总览
├─ 概览指标
├─ 快捷访问
├─ 需要注意
└─ 最近变化

端点
├─ 端点表 / 卡片
├─ 搜索与筛选
├─ 批量操作
└─ 端点详情抽屉

端口
├─ 端口矩阵
├─ 端口段筛选
└─ 空闲端口查找

网络 / IP
├─ Docker 网络列表
├─ 子网与 IP 池
├─ IP 变更历史
└─ 子网重叠告警

拓扑
├─ 主机 → 网络 → 容器 → 端点
└─ 布局切换

工具
├─ 端口占用检查
├─ 空闲端口
├─ 批量复制中心
└─ 二维码

设置
├─ 外观与动效
├─ 首选 IP
├─ 隐藏规则
├─ 标签
├─ 数据导出
└─ 安全
```

---

## 5. 数据模型

### 5.1 TypeScript 定义

```ts
type Protocol = "tcp" | "udp" | "sctp";
type IpVersion = 4 | 6;

type EndpointScope =
  | "HOST"
  | "CONTAINER"
  | "LAN"
  | "OVERLAY"
  | "LOOPBACK"
  | "HOST_NET"
  | "EXTERNAL";

type EndpointSource =
  | "PUBLISHED"
  | "HOST_LISTENER"
  | "EXPOSED"
  | "PROXY_LABEL"
  | "INFERRED"
  | "MANUAL";

interface Endpoint {
  id: string;
  key: string;
  hostId: string;

  scope: EndpointScope;
  sources: EndpointSource[];
  confidence: number;

  bindIp: string | null;
  ipVersion: IpVersion;
  port: number;
  protocol: Protocol;

  containerId: string | null;
  containerKey: string | null;
  containerName: string | null;
  containerPort: number | null;

  serviceName: string | null;
  stackName: string | null;
  image: string | null;

  networkId: string | null;
  networkName: string | null;

  accessIps: AccessIp[];
  urls: string[];

  tags: string[];
  favorite: boolean;
  hidden: boolean;

  firstSeen: string;
  lastSeen: string;
  stale: boolean;
}

interface AccessIp {
  ip: string;
  kind: "lan" | "vpn" | "loopback" | "container" | "public" | "other";
  iface?: string;
  preferred: boolean;
}

interface HostNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
  subnet: string | null;
  gateway: string | null;
  ipv6Subnet: string | null;
  ipv6Gateway: string | null;
  internal: boolean;
  containerCount: number;
  labels: Record<string, string>;
}

interface IpPool {
  networkId: string;
  cidr: string;
  family: 4 | 6;
  gateway: string | null;
  total: number | null;
  used: number;
  free: number | null;
  usedIps: IpUsage[];
  utilization: number | null;
}

interface IpUsage {
  ip: string;
  kind: "container" | "gateway" | "host" | "reserved" | "unknown";
  containerId?: string;
  containerName?: string;
  aliases?: string[];
}
```

### 5.2 端点稳定标识

容器重启后容器 ID 不变，但重建后会变。为了让“隐藏、标签、收藏、历史”尽量跨重建保留，定义：

```text
containerKey =
  compose project + "/" + compose service   // 有 Compose 标签时
  else container name 去掉随机后缀           // 例如 /nginx_1 -> nginx
  else container id

endpointKey =
  hostId | scope | bindIp | port | protocol | containerKey | containerPort

endpointId = sha256(endpointKey)[:16]
```

说明：

- IP 变化会产生新的 endpointId，但可通过 `containerKey` 关联历史。
- 端口变化同理。
- 手动端点使用 `scope=EXTERNAL` 和用户提供的 key。

### 5.3 多来源合并

同一 `bindIp + port + protocol` 可能同时来自 Docker 发布映射和宿主监听。

合并规则：

1. 以 `PUBLISHED` 为主来源。
2. `HOST_LISTENER` 作为佐证来源加入 `sources`，不重复生成行。
3. 若只有 `HOST_LISTENER`，生成 Scope 为 `HOST` 的端点，`containerId` 为空。
4. `INFERRED` 与 `PUBLISHED` 同时存在时，只保留 `PUBLISHED`，推断来源进详情。
5. 合并后 `confidence = max(source.confidence)`。

### 5.4 0.0.0.0 与多网卡

Docker 常见映射：

```text
0.0.0.0:8080->80/tcp
[::]:8080->80/tcp
```

`0.0.0.0` 不能直接复制给用户。处理方式：

- `bindIp` 保存真实绑定地址。
- `accessIps` 由宿主机网卡推导：
  - `0.0.0.0` → 所有非回环、非 Docker 虚拟网卡的 IPv4。
  - `::` → 所有非回环 IPv6。
  - 指定 IP → 只保留该 IP。
- 界面默认展示并复制“首选 IP”（可在设置中指定）。
- 详情中展示所有可用访问 IP，并标注网卡类型。
- 首选优先级：手动指定 > 局域网 > VPN > 其他。

### 5.5 过期与历史

- 容器停止：端点标记 `stale=true`，保留 7 天，界面弱化显示。
- 容器删除：端点进入历史，保留 30 天。
- 容器重建：新端点出现，旧端点进入历史，`containerKey` 相同则关联。
- IP 变化：记录 `endpoint_history`，在“最近变化”和详情时间线展示。
- 所有保留时长可在设置中调整。

---

## 6. 采集与推断

### 6.1 Docker API

只读接口：

```text
GET /version
GET /info
GET /containers/json?all=1
GET /containers/{id}/json
GET /networks
GET /events
```

从 `container inspect` 提取：

- `NetworkSettings.Networks`：每个网络的 `IPAddress`、`GlobalIPv6Address`、`MacAddress`、`Aliases`、`NetworkID`。
- `NetworkSettings.Ports`：发布映射，含 `HostIp`、`HostPort`。
- `Config.ExposedPorts`：声明的内部端口。
- `Config.Hostname`、`Config.Domainname`。
- `Config.Labels`：Compose 项目/服务、反代标签、自定义标签。
- `State.Status`、`State.StartedAt`、`RestartCount`。
- `HostConfig.NetworkMode`：判断 host 网络。

从 `network inspect` 提取：

- `Driver`、`Scope`、`Internal`。
- `IPAM.Config`：`Subnet`、`Gateway`、`IPRange`。
- `Containers`：网络内容器及 IP。
- `Labels`。

### 6.2 事件与轮询

```text
Docker Events  ──触发增量更新──▶ 内存快照 ──SSE──▶ 前端
      │
      └─ 断线重连后全量对账

每 30 秒定时全量对账（可配置 15/30/60 秒）
```

原则：

- 事件负责实时性。
- 轮询负责最终一致性。
- 扫描期间前端显示进度，不阻塞旧数据展示。
- 同一时刻只允许一个扫描任务，避免重复。

### 6.3 发布端口与内部端口

| 类型 | 来源 | 展示 |
|---|---|---|
| 发布端口 | `NetworkSettings.Ports` | 主列表，Scope 按 HostIp 判断 |
| 内部端口 | `Config.ExposedPorts` | 标记“内部”，默认展示，可过滤 |
| 未声明但监听 | 只能通过容器内扫描发现 | 首版不做容器内主动扫描 |
| host 网络端口 | 见 6.4 | 标注“推断”或“宿主监听” |

### 6.4 host 网络容器

host 网络容器没有独立 IP，端口直接绑定宿主机。首版采用多信号推断：

1. `Config.ExposedPorts`
2. `Config.Healthcheck.Test` 中的 `localhost:port`、`127.0.0.1:port`
3. `Entrypoint` / `Cmd` 中的 `--port`、`-p`、`--listen`、`--bind`
4. 环境变量：`PORT`、`HTTP_PORT`、`LISTEN_PORT`、`SERVER_PORT`
5. Compose 标签和镜像默认端口

所有推断结果标记 `INFERRED`，虚线展示，不覆盖宿主监听事实。

### 6.5 宿主机监听端口（内置，可选模式）

宿主监听扫描不单独部署 Agent，而是**同一个镜像、同一个容器**的两种运行模式：

| 模式 | 网络 | 权限 | 能力 |
|---|---|---|---|
| 默认模式 | bridge | 仅挂载 Docker socket | 覆盖所有 Docker 容器端口，满足绝大多数场景 |
| 完整模式 | host | `pid: host` + `SYS_PTRACE` | 额外读取宿主机监听端口和进程名 |

完整模式仍然只有一个容器，只是开启更高权限；不需要第二个镜像或 sidecar。

实现方式：

- 完整模式下容器共享宿主机网络命名空间，直接读取 `/proc/net/tcp`、`tcp6`、`udp`、`udp6`。
- 通过 `/proc/<pid>/fd` 映射 socket inode 到进程。
- 进程名不可读时降级为“未知进程”，不报错。
- `SYS_PTRACE` 仅用于读取进程信息；无法授予时自动降级为端口级数据。
- 默认模式不要求任何额外权限，设置页显示“宿主机监听未启用”。
- 完整模式启动时自动探测能力，能力不足则回退到默认模式，不阻塞启动。

### 6.6 反代与外部地址

首版支持标签约定，不读取 NPM 数据库：

```yaml
labels:
  docklens.url: "https://media.example.com"
  docklens.name: "Jellyfin"
  docklens.icon: "https://..."
  docklens.tags: "media,family"
  docklens.hide: "true"
```

同时识别常见标签：

- Traefik：`traefik.http.routers.*.rule` 中的 `Host(...)`。
- Caddy：`caddy`、`caddy.reverse_proxy`。
- 识别失败时允许手动添加外部端点。

### 6.7 IPv6 与端口范围

- IPv6 统一使用 `[addr]:port` 格式。
- 忽略 `fe80::` 链路本地地址，除非用户显式开启。
- Docker 端口范围会展开为多个端点，但超过 100 个时聚合为范围行，避免列表爆炸。
- 端口范围行可展开查看明细。

### 6.8 群晖环境限制

| 限制 | 处理 |
|---|---|
| Container Manager 只暴露 Docker API 子集 | 只使用稳定接口，启动时探测 API 版本 |
| 部分型号为 ARM | 提供 `linux/arm64`；armv7 可在本地构建 |
| 内存有限 | 默认 256MB 限制，流式解析，避免大对象常驻 |
| 宿主监听权限复杂 | 内置完整模式，权限不足时自动回退到默认模式 |
| DSM 反向代理可能缓冲 SSE | SSE 心跳 + 轮询降级 |
| 群晖自带反向代理占用 443 | 默认监听 7577，文档给出反代配置 |
| 用户可能没有公网域名 | 默认只展示局域网 IP，不查公网 IP |

### 6.9 失败与降级

| 故障 | 行为 |
|---|---|
| Docker socket 不可用 | 首屏显示明确错误和排查步骤，不白屏 |
| Docker socket 权限不足 | 显示 socket 挂载与权限提示 |
| 事件流断开 | 自动重连，期间退化为轮询 |
| 单个容器 inspect 失败 | 跳过该容器，记录告警，不影响其他容器 |
| 网络信息缺失 | 端点仍展示，网络字段显示“未知” |
| 宿主监听能力不足 | 自动回退默认模式，显示“仅 Docker 数据”，不作为错误 |

---

## 7. 功能规格

优先级：P0 = MVP 必须；P1 = 首个正式版；P2 = 后续。

### 7.1 总览（P0）

内容：

- 指标卡：容器数、端点数、网络数、冲突数、今日新增、IP 变化。
- 快捷访问：收藏的端点卡片，含图标、名称、地址、打开/复制。
- 需要注意：
  - 端口冲突。
  - 子网重叠。
  - 容器反复重启。
  - 端点不可达（可选探测）。
  - 高风险公网绑定（`0.0.0.0` + 敏感端口）。
- 最近变化时间线。

交互：

- 点击指标卡跳转到对应筛选列表。
- 快捷访问卡片支持拖拽排序。
- 时间线条目可点击定位到端点详情。

空状态：

- 未发现容器时显示“未发现运行中的容器”，并给出检查 socket 的入口。
- 所有容器都没有发布端口时，提示“容器运行中，但没有发布端口”，引导查看内部端口。

### 7.2 端点清单（P0）

视图：

- 表格视图（默认，适合桌面）。
- 卡片视图（适合平板/手机）。
- 分组视图：按容器、Compose 项目、网络、IP、端口、主机。

表格列：

| 列 | 说明 |
|---|---|
| 状态 | 运行/停止/推断/隐藏 |
| 服务 | 容器名 + Compose 服务名 |
| 镜像 | 镜像名，悬停显示完整 tag |
| 来源 | 发布 / 内部 / 监听 / 反代 / 推断 |
| 网络 | 网络名 + 驱动 |
| IP | 多 IP chip，首选 IP 高亮 |
| 端口 | `宿主端口 → 容器端口/协议` |
| 地址 | 可复制的 `IP:Port` 或 URL |
| 操作 | 复制、打开、详情、收藏、隐藏 |

排序：

- 默认按“最近变化”倒序。
- 支持按端口、IP、容器名、网络名排序。
- 稳定排序，避免刷新时跳动。

筛选：

- 主机、网络、来源、作用域、协议、IPv4/IPv6、运行状态、标签、收藏、隐藏。

批量操作：

- 全选当前筛选结果。
- 批量复制（IP / IP:Port / URL / Markdown / CSV / JSON）。
- 批量标签。
- 批量隐藏/取消隐藏。
- 导出当前结果。

验收：

- 500 端点滚动流畅，无明显掉帧。
- 多选状态在翻页/筛选后按显式选择保留。
- 复制内容与界面展示严格一致。

### 7.3 端口矩阵（P0/P1）

目标：把 DockPorts 的端口卡片升级成可扫描的“端口雷达”。

- 行：端口号。
- 列：主机 / IP / 协议。
- 颜色：已用、空闲、隐藏、推断、保留。
- 端口段：`1–1024`、`1024–49151`、`49152–65535`、自定义。
- 连续空闲端口合并为“空闲段”卡片，显示数量和范围。
- 点击已用端口定位到端点详情。
- 点击空闲段复制范围或查找可用端口。
- TCP / UDP 分开统计。
- 大范围使用分段渲染 + 虚拟滚动，避免一次渲染 65535 个格子。

### 7.4 IP 与子网（P1）

- 网络列表：名称、驱动、作用域、子网、网关、容器数。
- 子网详情：
  - CIDR、网关、已用/空闲数量、利用率。
  - 已用 IP 表：IP、容器、别名、类型。
  - IPv6 只统计已用，不枚举全量地址。
- 子网重叠：两两比较 CIDR，重叠时高亮告警。
- IP 变更历史：容器、旧 IP、新 IP、时间。
- 复制：CIDR、IP 列表、可用 IP。

### 7.5 拓扑（P1）

- 节点层级：Host → Network → Container → Endpoint。
- 布局：分层（默认）、力导向、Sankey。
- 边表示归属关系，不表示真实流量。
- 悬停高亮关联节点，点击复制或打开详情。
- 支持按网络/项目过滤。
- 超过 300 节点时默认聚合网络内端点，避免图不可读。
- 动效：数据流光沿边流动，仅在选中或刷新时启用；其余时间静态，降低性能开销。

### 7.6 容器详情抽屉（P0）

标签页：

1. 概览：名称、ID、镜像、状态、启动时间、重启次数、Compose 项目/服务。
2. 端口：发布映射图、内部端口、所有端点。
3. 网络：每个网络的 IP、IPv6、MAC、网关、别名。
4. 标签：Compose 标签、反代标签、自定义标签。
5. 环境变量：默认只显示 key，敏感值脱敏，点击展开单项。
6. 历史：首次出现、IP 变化、端口变化、重启记录。

底部操作：

- 复制全部端点。
- 复制 `docker run -p` 片段。
- 复制 Compose `ports` 片段。
- 复制容器网络信息。

只读约束：不提供启停、删除、终端、日志修改等操作。

### 7.7 工具（P0/P1）

- **端口占用检查**：输入 IP、端口、协议，返回占用来源。
- **空闲端口查找**：指定范围，返回可用端口，支持复制。
- **批量复制中心**：多选端点，选择输出格式。
- **二维码**：为 URL 生成二维码，方便手机打开。
- **导出**：CSV、JSON、Markdown 表格。
- **连通性测试（P2）**：从服务端发起 TCP 连接，结果标注“服务端视角”。

### 7.8 标签、收藏、隐藏（P0）

- 手动标签：新增、删除、颜色。
- 自动标签：
  - Compose 项目名。
  - 网络驱动。
  - `docklens.tags` 标签。
- 收藏：首页快捷访问。
- 隐藏：
  - 单端点隐藏。
  - 按端口/容器/网络批量隐藏。
  - 隐藏项进入“已隐藏”页签。
  - 隐藏状态持久化，容器重建后按 `endpointKey` 保留。

### 7.9 设置（P0/P1）

- 外观：深色/浅色、动效开关、背景星空密度、表格密度。
- 首选 IP：选择默认复制的网卡/IP。
- 刷新：自动刷新间隔、事件开关。
- 采集：内部端口、推断端口、宿主监听开关。
- 标签：管理标签和颜色。
- 安全：修改密码、会话时长、反向代理信任。
- 数据：导出/导入配置、清理历史。
- 关于：版本、API 版本、Docker 版本、镜像架构。

### 7.10 空、加载、错误状态

- 骨架屏：保持布局稳定，避免跳动。
- 扫描中：顶部细进度条 + “正在扫描 12/48”，旧数据可继续查看。
- 空状态：雷达线稿 + 一句具体说明 + 一个可执行操作。
- 错误：说明发生了什么、影响范围、如何排查，不显示堆栈。
- 推断数据：虚线边框 + 文字标签，不只靠颜色。

---

## 8. UI / UX 设计

### 8.1 视觉概念：深空全息

关键词：深空、全息投影、数据流、雷达、玻璃座舱。

不是霓虹赛博朋克，也不是纯黑极简。目标是**冷静、精确、有生命感**。

层次：

1. 背景层：深蓝黑渐变 + 极淡星点 + 细网格。
2. 环境层：缓慢移动的光晕，透明度极低。
3. 数据层：卡片、表格、文字，对比度最高。
4. 交互层：悬停、选中、焦点、数据流。
5. 装饰层：扫描线、粒子、边缘光，永远不遮挡内容。

### 8.2 布局

```
┌──────────────────────────────────────────────────────────────────────┐
│  DockLens     主机：DS920+ ▾    [ 搜索 :8080 / ip: / net: / tag: ]   │
│  全息状态：12 容器 · 48 端点 · 2 告警          刷新 09s   ☾   ⚙      │
├────────────┬─────────────────────────────────────────────────────────┤
│  总览      │  容器 12    端点 48    网络 5    冲突 2    今日新增 3   │
│  端点      │                                                         │
│  端口      │  ┌ 快捷访问 ────────────────────────────────────────┐   │
│  网络/IP   │  │  ◈ Jellyfin   192.168.1.20:8096     打开  复制    │   │
│  拓扑      │  │  ◈ qBittorrent 192.168.1.20:8080    打开  复制    │   │
│  工具      │  └──────────────────────────────────────────────────┘   │
│  设置      │                                                         │
│            │  ┌ 需要注意 ────────────────────────────────────────┐   │
│            │  │  ! 8080 同时被 2 个服务占用                      │   │
│            │  │  ! 10.0.2.7 容器 IP 已变化                       │   │
│            │  └──────────────────────────────────────────────────┘   │
│            │                                                         │
│            │  最近变化 ─────────────────────────────────────────────  │
│            │  10:32  Jellyfin 新增 192.168.1.20:8096/tcp             │
│            │                                                         │
│            │  ┌ 端点 ────────────────────────────────────────────┐   │
│            │  │ ● Jellyfin   bridge   192.168.1.20:8096 → 8096   │   │
│            │  │   [复制 IP] [复制端点] [打开] [详情]             │   │
│            │  └──────────────────────────────────────────────────┘   │
└────────────┴─────────────────────────────────────────────────────────┘
```

尺寸：

- 左侧导航：240px，可折叠到 72px。
- 顶部栏：56px，滚动时保持粘性。
- 内容区：最大 1600px，左右 24px。
- 详情抽屉：560px，移动端全屏底部抽屉。
- 表格行高：舒适 56px，紧凑 44px。

### 8.3 设计令牌

#### 颜色

| Token | 值 | 用途 |
|---|---|---|
| `bg-void` | `#050A14` | 最底层背景 |
| `bg-deep` | `#081120` | 页面背景 |
| `surface-1` | `rgba(12, 22, 40, 0.78)` | 卡片 |
| `surface-2` | `rgba(18, 32, 56, 0.88)` | 悬浮/抽屉 |
| `border-holo` | `rgba(56, 232, 255, 0.18)` | 默认边框 |
| `border-active` | `rgba(56, 232, 255, 0.55)` | 选中边框 |
| `hologram` | `#38E8FF` | 主强调、焦点、数据流 |
| `plasma` | `#4F7CFF` | 次强调、链接 |
| `ion` | `#3BF0B0` | 成功、运行中 |
| `amber` | `#FFB84D` | 警告、推断 |
| `coral` | `#FF5C7A` | 错误、冲突 |
| `text-primary` | `#E6F7FF` | 主文字 |
| `text-secondary` | `#8FA6BF` | 次文字 |
| `text-muted` | `#5C718A` | 弱文字 |

规则：

- 发光只用于焦点、选中、状态点、数据流，不用于大面积背景。
- 文字对比度不低于 4.5:1。
- 状态不能只依赖颜色，必须配文字或图标。
- 浅色模式降低饱和度，保留冷色调。

#### 字体

- UI：`Inter`，中文回退 `PingFang SC` / `Microsoft YaHei` / `Noto Sans SC`。
- 数据：`JetBrains Mono`，用于 IP、端口、容器 ID、CIDR。
- 标题：字重 600，不使用夸张大字号。
- 表格数字使用等宽字体，保证纵向对齐。

#### 字号与间距

| 用途 | 字号 |
|---|---|
| 页面标题 | 24px / 600 |
| 区块标题 | 16px / 600 |
| 正文 | 14px / 400 |
| 辅助文字 | 12px / 400 |
| 表格 | 13px / 400 |
| IP/端口 | 13px mono |
| 指标数字 | 28px / 600 mono |

间距使用 4px 基准：4、8、12、16、24、32、48。

圆角：

- 卡片 12px。
- 按钮 8px。
- Chip 6px。
- 抽屉 16px。

#### 阴影与发光

```css
--shadow-card: 0 8px 32px rgba(0, 0, 0, 0.35);
--glow-holo: 0 0 0 1px rgba(56, 232, 255, 0.25),
             0 0 24px rgba(56, 232, 255, 0.12);
--glow-danger: 0 0 0 1px rgba(255, 92, 122, 0.35),
               0 0 24px rgba(255, 92, 122, 0.15);
```

玻璃质感：

```css
background: rgba(12, 22, 40, 0.72);
backdrop-filter: blur(16px) saturate(120%);
border: 1px solid rgba(56, 232, 255, 0.18);
```

限制模糊层数量，避免低端设备掉帧。

### 8.4 动效设计

| 场景 | 动效 | 时长 | 缓动 |
|---|---|---|---|
| 页面切换 | 淡入 + 上移 8px | 180ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| 抽屉打开 | 右侧滑入 + 背景模糊 | 260ms | 同上 |
| 指标变化 | 数字滚动 | 500ms | `ease-out` |
| 列表新增 | 高度展开 + 高亮脉冲 | 400ms | `ease-out` |
| 列表删除 | 淡出 + 高度收起 | 240ms | `ease-in` |
| 复制成功 | 按钮短暂变为 ✓ + 光晕 | 900ms | `ease-out` |
| 扫描刷新 | 顶部扫描线从左到右 | 1.2s | `linear` |
| 拓扑数据流 | 虚线沿边流动 | 2.4s 循环 | `linear` |
| 拓扑节点脉冲 | 选中节点外环扩散 | 1.8s 循环 | `ease-out` |
| 悬停 | 边框增亮 + 轻微上浮 1px | 120ms | `ease-out` |

原则：

- 同一时刻只允许一个高亮脉冲，避免视觉打架。
- 刷新时不重播所有动画，只对变化项播放。
- 数据流只在拓扑选中/刷新时启用。
- 支持 `prefers-reduced-motion`，关闭非必要动效。
- 动画只使用 `transform` 和 `opacity`，避免布局抖动。
- 60fps 预算：单页同时运行的持续动画不超过 2 个。

### 8.5 背景与氛围

- CSS 渐变星空，不使用大图。
- 星点数量根据设备性能调整，默认 60 个。
- 指针移动时星点轻微视差，幅度不超过 4px。
- 网格透明度 3%–5%，仅作空间感。
- 扫描线只在刷新时出现，不常驻。
- 页面空闲 30 秒后降低环境动画频率，节省资源。

### 8.6 复制交互

触发方式：

- 点击地址 chip。
- 行操作菜单。
- 详情抽屉复制按钮。
- 批量复制中心。
- 快捷键 `C`。

复制菜单：

```
复制 IP
复制 IP:Port
复制 URL
复制映射关系     192.168.1.20:8096 → 8096/tcp
复制全部端点
复制为 Markdown
复制为 CSV
复制为 JSON
```

反馈：

- Toast：`已复制 192.168.1.20:8096`。
- 复制按钮 900ms 内显示 ✓。
- 失败时提示“浏览器阻止了剪贴板访问，请手动复制”，并提供可选文本框。

协议判断：

- 端口 443、8443、9443 默认 `https`。
- 其他默认 `http`。
- 手动外部端点使用用户提供的协议。
- 详情中可覆盖协议。

### 8.7 搜索语法

| 语法 | 示例 | 说明 |
|---|---|---|
| 普通文本 | `jellyfin` | 匹配容器、服务、镜像、标签 |
| 端口 | `:8080` | 精确端口 |
| 端口范围 | `:8000-8100` | 范围 |
| IP | `ip:192.168.1.` | 前缀或完整 IP |
| 网络 | `net:bridge` | 网络名 |
| 协议 | `proto:udp` | tcp/udp/sctp |
| 来源 | `source:published` | 来源 |
| 作用域 | `scope:lan` | 作用域 |
| 标签 | `tag:media` | 标签 |
| 状态 | `state:running` | 运行状态 |
| 收藏 | `fav:true` | 收藏 |
| 隐藏 | `hidden:true` | 隐藏 |

支持组合：`net:bridge proto:tcp :8080`。

命令面板 `Cmd/Ctrl+K`：

- 跳转页面。
- 搜索容器/端点。
- 复制首选地址。
- 切换主题/动效。
- 打开设置。

### 8.8 快捷键

| 快捷键 | 动作 |
|---|---|
| `/` | 聚焦搜索 |
| `Cmd/Ctrl + K` | 命令面板 |
| `C` | 复制当前选中端点 |
| `O` | 打开当前端点 |
| `Esc` | 关闭抽屉/清除搜索 |
| `↑ / ↓` | 列表导航 |
| `Space` | 选中/取消选中 |
| `H` | 隐藏/取消隐藏 |
| `F` | 收藏/取消收藏 |

### 8.9 响应式

| 断点 | 布局 |
|---|---|
| ≥ 1280px | 左侧导航 + 表格 + 右侧抽屉 |
| 768–1279px | 折叠导航 + 表格 + 覆盖抽屉 |
| < 768px | 顶部导航 + 卡片流 + 底部抽屉 |

移动端：

- 卡片优先展示服务名、地址、复制按钮。
- 复制按钮常驻，不藏在菜单里。
- 详情使用底部抽屉，支持下滑关闭。
- 拓扑默认只读，双指缩放。

### 8.10 可访问性

- 所有交互可键盘完成。
- 焦点环使用 `hologram` 色，清晰可见。
- 图标按钮必须有 `aria-label`。
- 状态变化通过 `aria-live` 通知。
- 不依赖颜色传达状态。
- 尊重减少动效设置。
- 表格有正确的表头关联。
- 对比度符合 WCAG AA。

### 8.11 文案风格

避免机械化、AI 味重的表达。规则：

- 用具体名词，不用“智能”“赋能”“一站式”“无缝”。
- 不堆感叹号，不用营销语。
- 错误信息说明原因和下一步。
- 推断数据明确标注“推断”，不模糊表述。
- 按钮使用动词：复制、打开、隐藏、导出。
- 空状态给可执行动作，不只说“暂无数据”。

示例：

| 不推荐 | 推荐 |
|---|---|
| 暂无数据 | 未发现运行中的容器。检查 Docker socket 后重试。 |
| 智能识别端口 | 从容器配置推断端口 |
| 一键赋能你的 NAS | 查看容器端口和访问地址 |
| 操作成功 | 已复制 192.168.1.20:8096 |
| 发生未知错误 | 无法连接 Docker。请确认 socket 已挂载。 |

---

## 9. 技术架构

### 9.1 总览

```
┌──────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│ React + Vite + Tailwind + shadcn/ui                          │
│ TanStack Query / Table / React Flow / Recharts               │
└───────────────▲──────────────────────────────────────────────┘
                │ HTTP / SSE
┌───────────────┴──────────────────────────────────────────────┐
│ DockLens 单容器                                               │
│  ├─ HTTP API (chi)                                           │
│  ├─ SSE Hub                                                  │
│  ├─ Collector (Docker SDK, 只读白名单)                        │
│  ├─ Host Scanner (同镜像，完整模式下启用)                      │
│  ├─ Inference Engine                                         │
│  ├─ Snapshot Store (in-memory)                               │
│  ├─ JSON metadata (history/settings)                         │
│  ├─ Auth / Export / Tools                                    │
│  └─ Embedded Web UI                                          │
└───────────────▲──────────────────────────────────────────────┘
                │ /var/run/docker.sock (ro)
                │ 可选：host 网络 + pid: host 读取宿主监听
┌───────────────┴──────────────────────────────────────────────┐
│ Docker Engine (Synology Container Manager)                   │
└──────────────────────────────────────────────────────────────┘
```

架构约束：

- 只有一个进程、一个容器、一个镜像。
- 前端静态资源嵌入 Go 二进制。
- 元数据使用本地 JSON 文件，无外部数据库。
- 不依赖 socket-proxy；需要高级加固的用户可自行在外部加代理，但不属于默认部署。
- 宿主监听与 Docker 采集在同一个进程内按模式启用。

### 9.2 Go 工程结构

```text
cmd/docklens/main.go
internal/
  api/            HTTP handlers, middleware, SSE
  auth/           session, password
  collector/      Docker collector, events, reconcile
  infer/          host network / label / command inference
  hostscan/       optional host listener scanner
  model/          domain types
  store/          JSON metadata, settings, history
  snapshot/       in-memory immutable snapshot
  netutil/        CIDR, IPv6, IP classification
  config/         env and settings
  version/
web/              embedded frontend dist
```

### 9.3 前端结构

```text
src/
  app/            routes, layout, providers
  components/     ui primitives, charts, topology
  features/
    overview/
    endpoints/
    ports/
    networks/
    topology/
    tools/
    settings/
  lib/            api client, copy, format, search parser
  styles/         tokens, global css, motion
```

### 9.4 状态与数据流

- 服务端维护不可变快照，扫描完成后原子替换。
- 前端通过 SSE 接收增量事件，TanStack Query 缓存列表。
- 搜索/筛选默认前端处理（数据量小），分页由服务端兜底。
- 拓扑数据单独接口，按需加载。
- 设置和隐藏/标签写入本地 JSON，不触发 Docker 写操作。

### 9.5 性能设计

- 扫描并发限制：容器 inspect 并发 8。
- 快照只保留必要字段，环境变量单独按需加载。
- 列表虚拟滚动。
- 大端口范围分段渲染。
- 拓扑超过 300 节点自动聚合。
- SSE 事件合并，100ms 窗口内去重。
- 前端动画只改 transform/opacity。
- 静态资源嵌入二进制，gzip/brotli。
- 首屏不做拓扑和图表，按需加载。

### 9.6 构建与发布

- Go 交叉编译 + embed 前端。
- Docker 多阶段构建。
- 多架构：`linux/amd64`、`linux/arm64`；armv7 按基础镜像支持情况本地构建。
- 镜像标签：`latest`、`vX.Y.Z`、`vX.Y`、`vX`。
- GitHub Actions：测试、构建、扫描、发布 GHCR。
- SBOM 和镜像签名（P1）。

---

## 10. API 设计

### 10.1 约定

- 前缀：`/api/v1`。
- JSON。
- 时间：ISO 8601 UTC。
- 分页：`page`、`pageSize`，默认 50，最大 200。
- 错误格式：

```json
{
  "error": {
    "code": "DOCKER_UNAVAILABLE",
    "message": "无法连接 Docker",
    "detail": "socket /var/run/docker.sock 不可用"
  }
}
```

### 10.2 接口

#### GET /api/v1/overview

```json
{
  "host": { "id": "local", "name": "DS920+", "dockerVersion": "24.0.7" },
  "counts": {
    "containers": 12,
    "endpoints": 48,
    "networks": 5,
    "conflicts": 2,
    "newToday": 3
  },
  "warnings": [
    { "type": "PORT_CONFLICT", "message": "8080 同时被 2 个服务占用" }
  ],
  "recent": [
    { "at": "2026-11-16T10:32:00Z", "type": "ENDPOINT_ADDED", "text": "Jellyfin 新增 192.168.1.20:8096/tcp" }
  ],
  "favorites": []
}
```

#### GET /api/v1/endpoints

查询参数：

```text
q, host, network, container, source, scope, proto, state,
ipVersion, tag, favorite, hidden, sort, page, pageSize
```

响应：

```json
{
  "items": [],
  "total": 48,
  "page": 1,
  "pageSize": 50,
  "scannedAt": "2026-11-16T10:32:00Z"
}
```

#### GET /api/v1/containers

返回容器摘要，可按状态筛选。

#### GET /api/v1/containers/{id}

返回详情，环境变量默认脱敏。

#### GET /api/v1/networks

返回网络和子网信息。

#### GET /api/v1/ip-pools

返回子网利用率、已用 IP、空闲数量。

#### GET /api/v1/topology

```json
{
  "nodes": [
    { "id": "host", "type": "host", "label": "DS920+" },
    { "id": "net:bridge", "type": "network", "label": "bridge", "subnet": "172.17.0.0/16" },
    { "id": "ctr:abc", "type": "container", "label": "jellyfin" },
    { "id": "ep:123", "type": "endpoint", "label": "8096/tcp" }
  ],
  "edges": []
}
```

#### GET /api/v1/tools/check-port

```text
?ip=192.168.1.20&port=8080&proto=tcp
```

#### GET /api/v1/tools/free-port

```text
?from=8000&to=9000&proto=tcp&count=5
```

#### GET /api/v1/events

SSE：

```text
event: snapshot
data: {...}

event: endpoint.added
data: {...}

event: endpoint.updated
data: {...}

event: scan.progress
data: {"done":12,"total":48}
```

#### 本地元数据操作

```text
POST   /api/v1/endpoints/{id}/hide
DELETE /api/v1/endpoints/{id}/hide
PATCH  /api/v1/endpoints/{id}        // tags, favorite
POST   /api/v1/manual-endpoints
DELETE /api/v1/manual-endpoints/{id}
```

说明：这些只写本地 JSON 元数据，不写 Docker。

#### 认证

```text
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
POST /api/v1/auth/password
```

#### 导出

```text
GET /api/v1/export?format=csv|json|md&q=...
```

#### 健康检查

```text
GET /healthz
```

---

## 11. 本地元数据存储

v1 使用本地 JSON 文件，避免为单容器工具引入数据库依赖。运行时数据（容器、端点、网络、IP 池）保存在内存快照中，隐藏、收藏、标签和设置持久化到 `/data/metadata.json`。

```json
{
  "endpoints": {
    "038e5ab5e26c0f89": {
      "hidden": false,
      "favorite": true,
      "tags": ["media", "family"]
    }
  },
  "settings": {
    "theme": "dark",
    "refresh": 30,
    "hostScan": false
  }
}
```

写入策略：

- 启动时读取；文件不存在则自动创建。
- 损坏文件重命名为 `metadata.json.corrupt`，以空配置启动，不阻塞面板。
- 原子写入：先写临时文件，再 rename。
- 文件权限 `0600`，目录 `0755`。
- 运行时端点历史保存在内存中，最多保留 50 条事件；重启后重新扫描生成。
- 后续如需要跨重启历史、审计和多用户，可在不改变 API 的前提下切换到 SQLite。

---

## 12. 安全与隐私

### 12.1 威胁模型

- Docker socket 等价于宿主机 root 权限。
- 面板被局域网内他人访问。
- 环境变量中包含密码、Token。
- 反向代理配置错误导致公网暴露。
- XSS 通过容器名/标签注入。

### 12.2 措施

> v0.0.1 实现状态：当前版本没有内置登录。以下登录、Session、CSRF、审计为后续规划；当前安全边界依赖可信局域网、VPN 或带认证的反向代理。

1. **只读 API**：不实现任何 Docker 写接口；代码层的 Docker 客户端只允许 `GET` 请求，从源头拒绝 POST/PUT/DELETE。
2. **单容器直连**：直接挂载 `/var/run/docker.sock:ro`，不强制额外部署 socket-proxy。需要更强隔离的用户可以自行加一层 socket-proxy，但不属于默认部署。
3. **挂载只读**：`/var/run/docker.sock:ro`；配合应用内白名单，避免误用写接口。
4. **默认监听局域网或 localhost**：建议 `127.0.0.1:7577`，由 DSM 反代暴露。
5. **登录**：首次启动生成随机初始密码，或强制设置密码。
6. **Session**：HttpOnly、SameSite=Lax、Secure（HTTPS 下）。
7. **CSRF**：本地元数据写操作校验 Origin + Token。
8. **CSP**：禁止内联脚本，限制图片来源。
9. **输出转义**：容器名、标签、镜像名全部转义。
10. **环境变量脱敏**：匹配 `PASSWORD`、`SECRET`、`TOKEN`、`KEY`、`CREDENTIAL`，默认显示 `••••••••`。
11. **无遥测**：不发送任何使用数据。
12. **无外部请求**：默认不解析公网 IP、不加载外部字体、不请求 CDN。
13. **审计**：记录登录、设置修改、隐藏/标签操作。
14. **公网风险提示**：`0.0.0.0` 绑定敏感端口时告警。

### 12.3 安全响应头

```text
Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

---

## 13. 部署（群晖优先）

### 13.1 前置条件

- DSM 7.2 或更高。
- Container Manager 已安装。
- 建议 1GB 以上可用内存。
- 架构：`amd64` 或 `arm64`（预构建镜像）。
- 不需要额外部署数据库、缓存、socket-proxy 或 Agent；一个容器即可运行全部功能。

### 13.2 目录

```text
/volume1/docker/docklens/
├─ .env
├─ VERSION
├─ docker-compose.yml
├─ docker-compose.full.yml
├─ Dockerfile
├─ web/
├─ internal/
├─ cmd/
└─ data/
```

### 13.3 默认模式：单容器 Compose

适合绝大多数群晖用户。一个容器，只读 Docker socket，覆盖所有 Docker 应用端口。

```yaml
services:
  docklens:
    image: ${DOCKLENS_IMAGE:-ghcr.io/marod1m/docklens}:${DOCKLENS_VERSION:-latest}
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VERSION: ${DOCKLENS_VERSION:-dev}
    container_name: docklens
    restart: unless-stopped
    ports:
      - "${DOCKLENS_BIND:-0.0.0.0}:${DOCKLENS_PORT:-7577}:7577"
    environment:
      TZ: ${TZ:-Asia/Shanghai}
      DOCKLENS_LISTEN: 0.0.0.0:7577
      DOCKLENS_DATA_DIR: /data
      DOCKER_HOST: unix:///var/run/docker.sock
      DOCKLENS_REFRESH: ${DOCKLENS_REFRESH:-30}
      DOCKLENS_HOST_IP: ${DOCKLENS_HOST_IP:-}
    volumes:
      - ${DOCKLENS_DATA_DIR:-./data}:/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    mem_limit: 256m
    healthcheck:
      test: ["CMD", "/docklens", "healthcheck"]
      interval: 30s
      timeout: 5s
      retries: 3
```

说明：

- 仓库实际 Compose 使用 `.env`，默认绑定 `0.0.0.0:7577`，方便局域网访问。
- 仅本机访问请设置 `DOCKLENS_BIND=127.0.0.1`，通过 DSM 反向代理或 SSH 隧道访问。
- 当前版本没有内置登录，默认只用于可信局域网。公网访问必须使用 VPN 或带认证的反向代理。
- 不需要 socket-proxy；Docker 客户端在代码层只允许只读接口。
- 不需要外部数据库，JSON 元数据写入 `./data`。

### 13.4 完整模式：同一个容器，开启宿主监听

需要查看群晖上**非 Docker 服务**的端口时，使用同一个镜像、同一个容器，只调整运行参数。仍然只有一个容器。对应仓库中的 `docker-compose.full.yml`。

```yaml
services:
  docklens:
    image: ${DOCKLENS_IMAGE:-ghcr.io/marod1m/docklens}:${DOCKLENS_VERSION:-latest}
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VERSION: ${DOCKLENS_VERSION:-dev}
    container_name: docklens
    restart: unless-stopped
    network_mode: host
    pid: host
    environment:
      TZ: ${TZ:-Asia/Shanghai}
      DOCKLENS_LISTEN: ${DOCKLENS_BIND:-0.0.0.0}:${DOCKLENS_PORT:-7577}
      DOCKLENS_DATA_DIR: /data
      DOCKER_HOST: unix:///var/run/docker.sock
      DOCKLENS_REFRESH: ${DOCKLENS_REFRESH:-30}
      DOCKLENS_HOST_IP: ${DOCKLENS_HOST_IP:-}
      DOCKLENS_HOST_SCAN: "true"
    volumes:
      - ${DOCKLENS_DATA_DIR:-./data}:/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
    cap_add:
      - SYS_PTRACE
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    mem_limit: 256m
```

说明：

- `network_mode: host` 后不再使用 `ports`，应用直接监听宿主机 `DOCKLENS_BIND:DOCKLENS_PORT`。
- DSM 反向代理仍指向 `localhost:7577`。
- 如需局域网直连，设置 `DOCKLENS_BIND=0.0.0.0`；默认只用于可信局域网。
- `pid: host` 用于把监听端口映射到进程；`SYS_PTRACE` 仅用于读取进程信息。
- 若 Container Manager 不允许 `pid: host` 或 `SYS_PTRACE`，删除对应配置即可，端口级宿主监听仍可用；不影响的 Docker 数据。
- 完整模式不是必须；默认模式已经覆盖所有 Docker 应用。

### 13.5 DSM 反向代理

DSM → 控制面板 → 登录门户 → 高级 → 反向代理：

```text
来源：HTTPS 443，主机名 docklens.example.com
目标：HTTP localhost 7577
```

注意：

- 启用 WebSocket/SSE 透传；若代理缓冲导致事件延迟，前端自动降级为轮询。
- 启用 HSTS。
- 只允许局域网访问，或加 VPN。
- QuickConnect 不适合自定义端口应用，使用 DDNS + 反向代理。

### 13.6 资源建议

| 容器数 | 内存 | CPU |
|---|---|---|
| < 20 | 128MB | 0.25 核 |
| 20–50 | 256MB | 0.5 核 |
| 50–100 | 384MB | 1 核 |

### 13.7 升级与备份

- 升级：修改镜像 tag，重新构建项目。
- 备份：备份 `data/` 目录，包含设置、隐藏、标签、历史。
- 导出：设置页导出 JSON，便于迁移。
- 回滚：固定版本 tag，不使用 `latest` 生产。

### 13.8 常见问题

| 问题 | 排查 |
|---|---|
| 无法连接 Docker | 检查 `/var/run/docker.sock` 是否挂载、容器内路径是否正确、socket 权限 |
| 端口 7577 被占用 | 修改 `DOCKLENS_LISTEN`；默认模式修改 compose 端口映射 |
| 页面无数据 | 确认容器在运行，检查 Docker API 版本 |
| SSE 不更新 | 检查反向代理缓冲，查看网络面板 |
| 宿主端口缺失 | 使用完整模式开启 `DOCKLENS_HOST_SCAN=true`，或接受仅 Docker 数据 |
| 完整模式启动失败 | 检查 Container Manager 是否允许 host 网络/`pid: host`；回退默认模式即可 |
| 是否需要 socket-proxy | 不需要，默认单容器直连；高级用户可自行加代理 |
| 中文乱码 | 检查 TZ 和浏览器字体 |
| ARM 设备无法启动 | 确认镜像架构与设备匹配 |

---

## 14. 测试与验收

### 14.1 单元测试

- 端点合并与去重。
- `0.0.0.0` 到多网卡地址推导。
- IPv4/IPv6 解析与格式化。
- CIDR 利用率与空闲 IP。
- 端口范围展开与聚合。
- Compose 标签解析。
- host 网络推断规则。
- 搜索语法解析。
- 敏感环境变量脱敏。

### 14.2 集成测试

使用 Docker API fixture：

- 单网络、多网络容器。
- 多 IP、IPv6。
- macvlan、ipvlan、overlay、host 网络。
- 端口范围映射。
- 停止容器、重建容器。
- 网络子网重叠。
- 反代标签。
- 缺失字段、异常响应。

### 14.3 E2E

Playwright：

- 登录。
- 总览加载。
- 搜索 `:8080`。
- 复制端点并校验剪贴板。
- 隐藏/取消隐藏。
- 打开详情。
- 批量复制。
- 移动端布局。
- 减少动效模式。

### 14.4 性能

- 100 容器 / 500 端点：首屏 < 1.5s，扫描 < 2s。
- 1000 宿主监听：扫描 < 3s。
- 列表滚动 60fps。
- 拓扑 300 节点可交互。
- 内存峰值 < 120MB。

### 14.5 安全

- 只读模式下抓包确认无 Docker 写请求。
- 环境变量不出现在 API 响应中（默认）。
- XSS 载荷注入容器名/标签后不执行。
- 未登录无法访问 API。
- CSP 生效。
- 依赖漏洞扫描无高危。

### 14.6 验收清单

- [ ] 能列出所有运行容器的发布端口。
- [ ] 能展示容器所有网络的 IPv4/IPv6。
- [ ] 能复制 IP、IP:Port、URL。
- [ ] 能区分发布/内部/监听/推断。
- [ ] 能搜索 `:端口` 和 `ip:`。
- [ ] 能隐藏和恢复端点。
- [ ] 能查看容器详情和网络信息。
- [ ] 能查看端口矩阵和空闲端口。
- [ ] 能查看子网和 IP 使用情况。
- [ ] 深色/浅色正常。
- [ ] 减少动效模式正常。
- [ ] 手机可用。
- [ ] 群晖 Container Manager 一键部署。
- [ ] 单镜像、单容器即可运行全部核心功能，无额外 sidecar/Agent/数据库。
- [ ] 完整模式仍为同一容器，仅调整运行参数。
- [ ] 无 Docker 写操作。
- [ ] 无外部网络请求。

---

## 15. 里程碑

| 阶段 | 内容 | 预估 |
|---|---|---|
| M0 | 设计文档、视觉稿、交互原型 | 2–3 天 |
| M1 | Go 工程骨架、Docker 采集、端点 API | 3–4 天 |
| M2 | 前端框架、总览、端点表、复制、详情 | 4–5 天 |
| M3 | 端口矩阵、IP/子网、工具、设置 | 4–6 天 |
| M4 | 拓扑、动效、响应式、可访问性 | 4–5 天 |
| M5 | 群晖部署、测试、文档、发布 | 3–4 天 |

单人开发约 3–4 周。M0 原型确认后再进入 M1。

---

## 16. 风险与开放问题

### 16.1 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 群晖 Container Manager 限制 host 网络或 `pid: host` | 宿主非 Docker 端口缺失 | 默认模式只依赖 Docker API；完整模式可选，能力不足自动回退 |
| 单容器直接挂载 Docker socket | 权限较大 | 代码层只读白名单 + socket 只读挂载；高级用户可自行加 socket-proxy |
| Docker API 版本差异 | 字段缺失 | 启动探测版本，字段缺失降级 |
| 0.0.0.0 多网卡地址选择错误 | 复制地址不可访问 | 首选 IP 设置 + 多地址下拉 |
| 子网很大导致枚举慢 | 性能下降 | IPv4 只展示已用 + 计数，IPv6 不枚举 |
| SSE 被反代缓冲 | 实时性下降 | 心跳 + 轮询降级 |
| 动效过多影响性能 | 掉帧 | 动效预算、减少动效模式、限制持续动画 |
| 剪贴板 API 受限 | 复制失败 | 降级手动复制框 |
| 容器名/标签注入 | XSS | 全部转义 + CSP |

### 16.2 开放问题

1. 产品最终名称是否使用 DockLens？
2. 默认是否需要登录？个人 NAS 是否可接受“仅局域网 + 无登录”？
3. 默认模式是否足够，还是首次启动就使用完整模式开启宿主监听？
4. 是否需要在首版支持 Tailscale/WireGuard 网卡标识？
5. 是否需要 Docker Compose 项目维度的聚合首页？
6. 外部 URL 是否只依赖标签，还是提供手动维护界面？
7. 是否接受默认直接挂载 Docker socket，还是希望保留可选的 socket-proxy 加固入口？

---

## 附录 A：复制格式

```text
IP:
192.168.1.20

IP:Port:
192.168.1.20:8096

URL:
http://192.168.1.20:8096

映射关系:
192.168.1.20:8096 -> 8096/tcp (jellyfin)

Markdown:
| 服务 | 地址 | 协议 |
|---|---|---|
| jellyfin | 192.168.1.20:8096 | tcp |

JSON:
[{"name":"jellyfin","ip":"192.168.1.20","port":8096,"protocol":"tcp"}]

Compose ports:
- "8096:8096/tcp"
```

## 附录 B：搜索语法速查

```text
:8080
:8000-8100
ip:192.168.1.20
ip:172.18.
net:bridge
proto:udp
source:published
scope:lan
tag:media
state:running
fav:true
hidden:false
```

## 附录 C：标签约定

```yaml
labels:
  docklens.name: "Jellyfin"
  docklens.url: "https://media.example.com"
  docklens.icon: "https://example.com/icon.png"
  docklens.tags: "media,family"
  docklens.hide: "false"
  docklens.port.8096.name: "Web"
```

## 附录 D：术语

| 术语 | 说明 |
|---|---|
| 端点 | `IP:Port/Protocol` 的可访问或可识别地址 |
| 发布端口 | Docker 将容器端口映射到宿主机 |
| 内部端口 | 容器声明但未发布的端口 |
| 推断端口 | 从配置、命令、环境变量推测的端口 |
| 首选 IP | 默认复制和展示的宿主机 IP |
| 容器 IP | 容器在 Docker 网络中的地址 |
| IP 池 | Docker 子网内可分配地址集合 |
| 稳定标识 | 跨容器重启尽量保持不变的端点标识 |
