#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

docker compose -f docker-compose.yml down 2>/dev/null || true
docker compose -f docker-compose.full.yml down 2>/dev/null || true
docker compose -f docker-compose.pull.yml down 2>/dev/null || true
docker compose -f docker-compose.synology.yml down 2>/dev/null || true

echo "DockLens 已停止。数据目录保留，可手动删除 ./data。"
