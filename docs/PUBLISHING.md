# GitHub 发布清单

本文按仓库 `github.com/MaroD1M/docklens`、作者 `MaroD1M` 准备。如果仓库名不同，需要同步替换 `MaroD1M/docklens` 和 `marod1m/docklens`。

## 仓库信息

Description：

```text
Deep-space holographic Docker IP, port and endpoint dashboard. Single container, read-only, Synology friendly.
```

Topics：

```text
docker
docker-compose
nas
synology
self-hosted
port-manager
network-visualization
container-monitoring
golang
react
```

Website 填写 `https://github.com/MaroD1M/docklens`，社交预览图使用 `docs/screenshots/overview.png`。

## Actions 权限

仓库 Settings → Actions → General：

- 允许使用 GitHub Actions
- Workflow permissions 选择 Read and write permissions
- `docker.yml` 使用 `GITHUB_TOKEN` 推送到 GHCR，不需要额外 Secret

## 触发规则

| 事件 | 行为 |
|---|---|
| 普通 `push` | 不构建镜像，也不运行 CI |
| Pull Request、手动触发 | `ci.yml` 运行前端类型检查与构建、Go 测试与 vet |
| 推送 `v*` 标签 | `docker.yml` 构建 `linux/amd64` / `linux/arm64`，推送 GHCR 并创建 GitHub Release |

`docker.yml` 会校验 `VERSION` 与标签一致。所有工作流均不启用 Actions 缓存，并关闭 provenance 和 SBOM，减少额度占用。

## 首次发布

```bash
# 首次发布前先提交完整项目
git add -A
git commit -m "initial commit"

echo 0.0.1 > VERSION
# 更新 CHANGELOG.md
./scripts/release.sh
git push origin HEAD
git push origin v0.0.1
```

标签推送后会自动构建镜像并创建 GitHub Release，不需要在 Releases 页面手动创建。打开 Actions 确认 `release` 工作流通过。

发布后镜像：

```text
ghcr.io/marod1m/docklens:v0.0.1
ghcr.io/marod1m/docklens:0.0.1
ghcr.io/marod1m/docklens:0.0
ghcr.io/marod1m/docklens:latest
```

## GHCR 可见性

1. 打开 GitHub 个人主页 → Packages → `docklens`
2. 进入 Package settings → Danger Zone → Change visibility
3. 改为 Public，方便他人和群晖 Container Manager 拉取

## 清理

工作流不写入 Actions 缓存，一般不需要清理缓存。仍可定期删除旧运行和旧镜像：

```bash
gh run list --limit 20
gh run delete <run-id>
```

GHCR 中的旧版本可在 Packages → `docklens` 中删除，建议保留 `latest` 和最近几个版本标签。

## 发布前检查

- [ ] `README.md` 中的仓库地址和作者信息正确
- [ ] `LICENSE` 版权人正确
- [ ] `VERSION` 与即将创建的标签一致
- [ ] `.env.example` 的 `DOCKLENS_VERSION` 与 `VERSION` 一致
- [ ] `web/package.json` 和 `web/package-lock.json` 版本已同步
- [ ] `docker-compose*.yml` 默认镜像地址正确
- [ ] `.env.example` 不包含真实密钥，`.env` 未被提交
- [ ] `CHANGELOG.md` 已更新
- [ ] `ci.yml` 和 `docker.yml` 在 Actions 中通过
- [ ] GHCR 包可见性已设置
- [ ] `docs/screenshots/` 截图已提交
