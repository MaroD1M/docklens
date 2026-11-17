#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

VERSION="$(cat VERSION 2>/dev/null || true)"
if [ -z "$VERSION" ]; then
  echo "VERSION 文件为空。"
  exit 1
fi

if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "VERSION 必须是类似 0.0.1 的格式。"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "未找到 git。"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 node，无法同步 web/package.json 版本。"
  exit 1
fi

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "仓库还没有提交。请先提交项目文件，再执行发布。"
  exit 1
fi

if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
  echo "标签 v${VERSION} 已存在。"
  exit 1
fi

if ! grep -Fq "## ${VERSION}" CHANGELOG.md; then
  echo "CHANGELOG.md 中没有 ${VERSION} 条目，请先更新更新日志。"
  exit 1
fi

DIRTY="$(git status --porcelain | grep -vE ' (VERSION|\.env\.example|web/package\.json|web/package-lock\.json|CHANGELOG\.md)$' || true)"
if [ -n "$DIRTY" ]; then
  echo "工作区存在未提交变更，请先提交后再发布："
  echo "$DIRTY"
  exit 1
fi

sed -i.bak "s/^DOCKLENS_VERSION=.*/DOCKLENS_VERSION=${VERSION}/" .env.example
rm -f .env.example.bak

VERSION="$VERSION" node -e '
const fs = require("fs");
const version = process.env.VERSION;
for (const file of ["web/package.json", "web/package-lock.json"]) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.version = version;
  if (file.endsWith("package-lock.json") && data.packages && data.packages[""]) {
    data.packages[""].version = version;
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}
'

git add VERSION .env.example web/package.json web/package-lock.json CHANGELOG.md
if ! git diff --cached --quiet -- VERSION .env.example web/package.json web/package-lock.json CHANGELOG.md; then
  git commit -m "release: v${VERSION}" -- VERSION .env.example web/package.json web/package-lock.json CHANGELOG.md
fi

git tag -a "v${VERSION}" -m "DockLens v${VERSION}"

echo "已创建标签 v${VERSION}。"
echo "下一步："
echo "  git push origin HEAD"
echo "  git push origin v${VERSION}"
