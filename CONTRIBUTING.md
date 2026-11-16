# Contributing

感谢参与 DockLens。

## 开发环境

- Go 1.24+
- Node.js 24+
- Docker Engine 20.10+（可选）
- Docker Compose v2（可选）

## 本地开发

```bash
# 前端
cd web
npm install
npm run dev

# 后端
go run ./cmd/docklens
```

前端开发服务器会把 `/api` 代理到 `http://127.0.0.1:7577`。

## 检查

提交前请运行：

```bash
cd web && npm run typecheck && npm run build
cd .. && go test ./... && go vet ./...
```

或：

```bash
make lint
make test
```

## 代码风格

- Go 使用 `gofmt`
- 前端使用 TypeScript strict
- 不新增未使用的依赖
- 界面文案保持具体、简洁，不使用营销式表达
- 不提交 `.env`、`data/`、`dist/`、`bin/` 等本地产物

## Pull Request

- 一个 PR 只做一件事
- 说明变更内容和验证方式
- 界面变化请附截图
- 修复问题请关联 Issue
- 新功能请先通过 Issue 讨论范围

## 发布流程

版本号统一在根目录 `VERSION` 文件。

```bash
# 1. 修改 VERSION
echo 0.0.1 > VERSION

# 2. 更新 CHANGELOG.md

# 3. 同步版本、提交、打标签
./scripts/release.sh

# 4. 推送
git push origin HEAD
git push origin v0.0.1
```

普通 push 不触发镜像构建。只有 `v*` 标签会触发 GitHub Actions 构建多架构镜像并创建 Release：

```text
ghcr.io/marod1m/docklens:v0.0.1
ghcr.io/marod1m/docklens:0.0.1
ghcr.io/marod1m/docklens:0.0
ghcr.io/marod1m/docklens:latest
```
