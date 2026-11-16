# API 文档

默认地址：

```text
http://127.0.0.1:7577
```

所有接口前缀为 `/api/v1`，返回 JSON。时间使用 RFC 3339 或本地 `HH:mm` 字符串。

## 响应格式

成功：

```json
{
  "items": [],
  "total": 0,
  "scannedAt": "2026-11-16T10:32:00Z"
}
```

错误：

```json
{
  "error": {
    "code": "DOCKER_UNAVAILABLE",
    "message": "无法读取 Docker 数据",
    "detail": "dial unix /var/run/docker.sock: connect: no such file or directory"
  }
}
```

## 健康检查

### GET /healthz

```bash
curl http://127.0.0.1:7577/healthz
```

```json
{
  "status": "ok",
  "uptime": "1m20s",
  "scannedAt": "2026-11-16T10:32:00Z"
}
```

Docker 不可用时返回 `degraded`，但 HTTP 状态仍为 `200`。

### GET /api/v1/status

返回扫描状态、最近扫描时间、错误信息、版本、提交和构建时间。

```json
{
  "scanning": false,
  "lastScan": "2026-11-16T10:32:00Z",
  "uptime": "12m30s",
  "version": "0.0.1",
  "commit": "abc1234",
  "buildDate": "2026-11-16T10:00:00Z"
}
```

## 概览

### GET /api/v1/overview

```json
{
  "host": {
    "id": "local",
    "name": "DS920+",
    "dockerVersion": "24.0.7",
    "apiVersion": "1.44",
    "preferredIp": "192.168.1.20",
    "addresses": [
      { "ip": "192.168.1.20", "kind": "lan", "preferred": true }
    ]
  },
  "counts": {
    "containers": 12,
    "endpoints": 48,
    "networks": 5,
    "conflicts": 2,
    "newToday": 3,
    "ipChanges": 1
  },
  "warnings": [],
  "recent": [],
  "favorites": []
}
```

## 完整快照

### GET /api/v1/snapshot

返回：

```json
{
  "scannedAt": "2026-11-16T10:32:00Z",
  "host": {},
  "containers": [],
  "networks": [],
  "endpoints": [],
  "ipPools": [],
  "warnings": [],
  "recent": []
}
```

## 端点

### GET /api/v1/endpoints

查询参数：

| 参数 | 说明 |
|---|---|
| `q` | 搜索语法，见下文 |
| `scope` | `HOST`、`CONTAINER`、`LAN`、`OVERLAY`、`LOOPBACK`、`HOST_NET`、`EXTERNAL` |
| `source` | `PUBLISHED`、`HOST_LISTENER`、`EXPOSED`、`PROXY_LABEL`、`INFERRED`、`MANUAL` |
| `proto` | `tcp`、`udp`、`sctp` |
| `state` | `running`、`stale` |
| `network` | 网络名或网络 ID |
| `tag` | 标签 |
| `favorite` | `true` |
| `hidden` | `true` / `false` |
| `includeHidden` | `true` 同时返回隐藏端点 |
| `page` | 页码，默认 1 |
| `pageSize` | 每页数量，默认 50，最大 200 |

示例：

```bash
curl 'http://127.0.0.1:7577/api/v1/endpoints?q=:8080'
curl 'http://127.0.0.1:7577/api/v1/endpoints?network=app-net&proto=tcp'
curl 'http://127.0.0.1:7577/api/v1/endpoints?hidden=true'
```

### 搜索语法

| 语法 | 示例 | 说明 |
|---|---|---|
| 普通文本 | `jellyfin` | 服务、容器、镜像、标签、网络、IP、端口 |
| 端口 | `:8080` | 精确端口 |
| 端口范围 | `:8000-8100` | 范围 |
| IP | `ip:192.168.1.` | IP 前缀 |
| 网络 | `net:bridge` | 网络名 |
| 标签 | `tag:media` | 标签 |
| 协议 | `proto:udp` | 协议 |
| 作用域 | `scope:lan` | 作用域 |
| 来源 | `source:published` | 来源 |
| 状态 | `state:running` | 状态 |
| 收藏 | `fav:true` | 收藏 |
| 隐藏 | `hidden:true` | 隐藏 |

多个条件用空格组合，按 AND 匹配：

```text
net:app-net proto:tcp :8000-9000
```

### 端点对象

```json
{
  "id": "038e5ab5e26c0f89",
  "service": "jellyfin",
  "container": "jellyfin",
  "image": "jellyfin/jellyfin:10.10",
  "stack": "media",
  "scope": "HOST",
  "source": "PUBLISHED",
  "status": "running",
  "ip": "0.0.0.0",
  "port": 8096,
  "protocol": "tcp",
  "containerPort": 8096,
  "network": "media-net",
  "networkId": "net-media",
  "url": "http://192.168.1.20:8096",
  "tags": ["media", "family", "published", "tcp"],
  "favorite": true,
  "hidden": false,
  "confidence": 100,
  "updatedAt": "10:32",
  "accessIps": [
    { "ip": "192.168.1.20", "kind": "lan", "iface": "eth0", "preferred": true }
  ],
  "note": "绑定 0.0.0.0，访问地址来自宿主机网卡"
}
```

### PATCH /api/v1/endpoints/{id}

更新隐藏、收藏、标签。只写本地元数据，不写 Docker。

```bash
curl -X PATCH http://127.0.0.1:7577/api/v1/endpoints/038e5ab5e26c0f89 \
  -H 'Content-Type: application/json' \
  -d '{"hidden": true, "favorite": true, "tags": ["media", "family"]}'
```

请求字段均可选。

## 容器

### GET /api/v1/containers

```bash
curl 'http://127.0.0.1:7577/api/v1/containers'
curl 'http://127.0.0.1:7577/api/v1/containers?q=immich'
```

### GET /api/v1/containers/{id}

`{id}` 可以是容器 ID、容器名或 Compose 服务名。

```json
{
  "container": {},
  "endpoints": [],
  "networks": []
}
```

## 网络与 IP 池

### GET /api/v1/networks

```bash
curl http://127.0.0.1:7577/api/v1/networks
```

### GET /api/v1/ip-pools

```bash
curl http://127.0.0.1:7577/api/v1/ip-pools
```

IPv4 返回总量、已用、空闲和利用率。v0.0.1 的 IP 池统计以 IPv4 为主，IPv6 端点仍会在端点列表中展示。

## 拓扑

### GET /api/v1/topology

```json
{
  "nodes": [
    { "id": "host:local", "type": "host", "label": "DS920+", "x": 90, "y": 80 },
    { "id": "net:net-app", "type": "network", "label": "app-net", "x": 330, "y": 80 },
    { "id": "ctr:net-app:c1", "type": "container", "label": "jellyfin", "x": 640, "y": 80 },
    { "id": "ep:abc", "type": "endpoint", "label": "8096/tcp", "x": 960, "y": 80 }
  ],
  "edges": [
    { "id": "edge:host:net-app", "source": "host:local", "target": "net:net-app" }
  ]
}
```

节点类型：`host`、`network`、`container`、`endpoint`。

## 工具

### GET /api/v1/tools/check-port

```bash
curl 'http://127.0.0.1:7577/api/v1/tools/check-port?ip=192.168.1.20&port=8080&proto=tcp'
```

```json
{
  "ip": "192.168.1.20",
  "port": 8080,
  "protocol": "tcp",
  "available": false,
  "matches": [
    {
      "service": "qbittorrent",
      "ip": "0.0.0.0",
      "port": 8080,
      "protocol": "tcp",
      "scope": "HOST"
    }
  ],
  "alternatives": [8081, 8082, 8083, 8084, 8085]
}
```

### GET /api/v1/tools/free-port

```bash
curl 'http://127.0.0.1:7577/api/v1/tools/free-port?from=8000&to=8100&count=5&proto=tcp'
```

```json
{
  "from": 8000,
  "to": 8100,
  "protocol": "tcp",
  "count": 5,
  "ports": [8000, 8001, 8002, 8003, 8004]
}
```

`proto=all` 表示同时避开 TCP 和 UDP 端口。

## 导出

### GET /api/v1/export

```bash
curl -o endpoints.json 'http://127.0.0.1:7577/api/v1/export?format=json'
curl -o endpoints.csv  'http://127.0.0.1:7577/api/v1/export?format=csv'
curl -o endpoints.md   'http://127.0.0.1:7577/api/v1/export?format=md'
```

支持 `json`、`csv`、`md`。

## 设置

### GET /api/v1/settings

返回本地保存的设置。

### PUT /api/v1/settings

```bash
curl -X PUT http://127.0.0.1:7577/api/v1/settings \
  -H 'Content-Type: application/json' \
  -d '{"theme":"dark","animations":true,"density":"comfortable"}'
```

## 刷新

### POST /api/v1/refresh

触发一次异步扫描。

```bash
curl -X POST http://127.0.0.1:7577/api/v1/refresh
```

```json
{ "accepted": true }
```

## 实时事件

### GET /api/v1/events

SSE 长连接。

```bash
curl -N http://127.0.0.1:7577/api/v1/events
```

事件：

| 事件 | 说明 |
|---|---|
| `snapshot` | 概览数据更新 |
| `endpoint.updated` | 隐藏、收藏、标签更新 |
| `scan.status` | 扫描开始/结束 |

示例：

```text
event: snapshot
data: {"host":{},"counts":{},"warnings":[],"recent":[],"favorites":[]}

event: endpoint.updated
data: {"id":"038e5ab5e26c0f89","service":"jellyfin"}
```

服务端每 15 秒发送心跳：

```text
: ping
```

## 当前用户

### GET /api/v1/auth/me

当前版本没有登录系统，固定返回本地管理员：

```json
{
  "id": "local",
  "username": "admin",
  "role": "owner",
  "local": true
}
```

## 只读约束

- 不提供容器启停、删除、重建
- 不提供 Compose 编辑
- 不提供镜像删除
- 不提供终端和日志修改
- Docker 客户端只允许 GET 请求
- 隐藏、收藏、标签、设置只写本地 `/data/metadata.json`
