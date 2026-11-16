# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.0.x | Yes |
| 其他 | No |

## Reporting a vulnerability

请不要在公开 Issue 中提交安全问题。

使用 GitHub Security Advisories：

https://github.com/MaroD1M/docklens/security/advisories/new

请在报告中包含：

- 受影响版本或 commit
- 部署方式（简单模式 / 完整模式）
- 复现步骤
- 影响范围
- 可行的修复建议

## Security model

DockLens 需要访问 `/var/run/docker.sock`。该 socket 等价于宿主机高权限，因此：

- 只运行来自可信来源的镜像
- 使用只读方式挂载 Docker socket
- 不要将面板直接暴露到公网
- 公网访问请使用 VPN，或在反向代理层增加认证
- 建议设置 `DOCKLENS_BIND=127.0.0.1`，通过反向代理访问

完整模式额外使用 host 网络、`pid: host` 和 `SYS_PTRACE`，仅用于读取宿主机监听端口。不需要时请使用默认模式。

DockLens 的代码约束：

- 只实现 Docker 只读接口
- 不提供容器启停、删除、重建
- 不提供 Compose 编辑
- 不返回容器环境变量值
- 不联网、不遥测、不请求外部 CDN
- 隐藏、收藏、标签、设置只写本地 `/data/metadata.json`

## Hardening checklist

- [ ] 面板只监听可信网段
- [ ] 反向代理启用 HTTPS 和认证
- [ ] Docker socket 只读挂载
- [ ] 生产环境尽量固定版本标签；群晖示例使用 `latest` 方便升级，也可改成具体 tag
- [ ] 定期更新镜像
- [ ] 备份 `./data`
