# 部署文档

DockLens 是单镜像、单容器应用，只需要 Docker 和 Docker socket，不依赖数据库、Redis 或额外 Agent。

## 前置条件

- Docker Engine 20.10+ 或兼容的容器运行时
- Docker Compose v2
- 可读取 `/var/run/docker.sock`
- 建议 256MB 以上可用内存
- 架构：`linux/amd64` 或 `linux/arm64`

## 群晖 Synology

推荐使用 Container Manager 项目，粘贴仓库中的 `docker-compose.synology.yml`。该文件不包含 `build`，使用 host 网络以正确识别 NAS 的局域网 IP，镜像固定为当前版本，升级时修改 image 标签。

1. 在 `/volume1/docker/docklens` 创建项目目录，可通过 File Station 或 SSH。
2. 打开 Container Manager → 项目 → 新增。
3. 项目路径选择 `/volume1/docker/docklens`，来源选择“创建 docker-compose.yml”。
4. 粘贴 `docker-compose.synology.yml` 的内容并启动。
5. 浏览器访问 `http://<NAS-IP>:7577`。

通常只需要修改监听端口。如果 `7577` 已被占用，改成其他端口：

```yaml
environment:
  DOCKLENS_LISTEN: 0.0.0.0:8080
```

数据保存在项目目录下的 `./data`。如果使用 SSH，也可以在项目目录执行：

```bash
./scripts/install.sh synology
```

建议只允许可信网段访问面板端口。需要 HTTPS 或统一入口时，可用 DSM 反向代理指向 `http://localhost:7577`，并在代理层增加认证。

## 通用 Docker Compose

从源码构建：

```bash
git clone https://github.com/MaroD1M/docklens.git
cd docklens
cp .env.example .env
docker compose up -d --build
```

bridge 模式下请把 `.env` 中的 `DOCKLENS_HOST_IP` 设为 NAS 的局域网 IP，否则复制出的地址可能是容器内部 IP。

使用预构建镜像，不在本地构建：

```bash
docker compose -f docker-compose.pull.yml pull
docker compose -f docker-compose.pull.yml up -d
```

查看状态和日志：

```bash
docker compose ps
docker compose logs -f --tail=200
```

## 完整模式

需要读取宿主机非 Docker 端口时，使用完整模式：

```bash
docker compose -f docker-compose.full.yml up -d --build
```

完整模式使用 host 网络、`pid: host` 和 `SYS_PTRACE`，仍然只有一个容器。不需要宿主监听时使用默认模式。

## 修改端口

群晖 host 网络模式修改 `DOCKLENS_LISTEN`。通用 bridge 模式修改 `.env`：

```env
DOCKLENS_BIND=0.0.0.0
DOCKLENS_PORT=7577
```

也可以直接修改 Compose 的 `ports`：

```yaml
ports:
  - "8080:7577"
```

改为 `DOCKLENS_BIND=127.0.0.1` 时只监听本机，需要通过反向代理或 SSH 隧道访问。当前版本没有内置登录，不要把面板直接暴露到公网。

## 数据与备份

- 隐藏、收藏、标签和设置保存在 `./data/metadata.json`
- 容器、网络、端点、IP 池属于运行时数据，每次扫描重新生成
- 备份：复制整个 `./data` 目录
- 迁移：把 `./data` 放到新机器的对应目录
- 重置：停止容器后删除 `./data`

```bash
tar -czf docklens-data-$(date +%Y%m%d).tar.gz data
```

## 升级

从源码构建：

```bash
git pull
docker compose up -d --build
```

使用预构建镜像：

```bash
docker compose -f docker-compose.pull.yml pull
docker compose -f docker-compose.pull.yml up -d
```

预构建镜像的版本由 `.env` 中的 `DOCKLENS_VERSION` 决定。群晖使用 `docker-compose.synology.yml` 时，升级需要修改其中的 image 标签或拉取新的版本。升级前建议备份 `./data`。

## 故障排查

无法读取 Docker 数据时，先确认 socket 存在并已挂载：

```bash
ls -l /var/run/docker.sock
docker inspect docklens --format '{{json .Mounts}}'
```

页面能打开但没有数据：

```bash
docker compose logs --tail=100
curl http://127.0.0.1:7577/api/v1/overview
```

返回 `DOCKER_UNAVAILABLE` 表示 socket 或权限有问题。端口冲突时修改 `DOCKLENS_PORT` 或 Compose 端口映射后重启。SSE 不更新通常是反向代理缓冲导致。前端会保留最近一次数据，并在连接异常时尝试轮询刷新。ARM 设备请确认镜像包含 `linux/arm64`。
