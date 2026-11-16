# Changelog

## 0.0.1 - 2026-11-16

首个可运行版本。

### 前端

- 深空全息视觉与动效
- 总览、端点、端口矩阵、网络/IP、拓扑、工具、设置
- 端点搜索、筛选、多选、批量复制
- 详情抽屉、收藏、隐藏、标签
- 端口占用检查、空闲端口查找、端口段复制
- Docker 网络、子网、IP 池、子网重叠提示
- 深色 / 浅色、移动端、减少动效
- 有后端时使用实时数据，无后端时回退演示数据

### 后端

- Go 只读 Docker 采集
- 发布端口、内部 EXPOSE 端口、host 网络推断
- 多网络、多 IP、IPv4 / IPv6
- 端点去重、IP 池、端口冲突、子网重叠
- REST API、SSE 实时推送
- 本地 JSON 元数据持久化
- 可选宿主机监听扫描
- 前端静态资源嵌入二进制

### 部署

- 单镜像、单容器
- 简单模式与完整模式
- Dockerfile、docker-compose.yml、docker-compose.full.yml
- docker-compose.pull.yml 预构建镜像部署
- 一键安装脚本
- 群晖 Container Manager 部署说明

### 项目

- README、部署、API 文档
- AGPL-3.0-or-later
- Issue 模板、PR 模板
- 安全策略与贡献指南
