#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

MODE="${1:-simple}"
COMPOSE_FILE="docker-compose.yml"
BUILD_FLAG="--build"
PULL_IMAGE="false"

case "$MODE" in
  simple|--simple)
    COMPOSE_FILE="docker-compose.yml"
    ;;
  full|--full)
    COMPOSE_FILE="docker-compose.full.yml"
    ;;
  pull|--pull)
    COMPOSE_FILE="docker-compose.pull.yml"
    BUILD_FLAG=""
    PULL_IMAGE="true"
    ;;
  synology|--synology)
    COMPOSE_FILE="docker-compose.synology.yml"
    BUILD_FLAG=""
    PULL_IMAGE="true"
    ;;
  *)
    echo "用法: $0 [simple|full|pull|synology]"
    exit 1
    ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker，请先安装 Docker。"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "未找到 docker compose v2，请升级 Docker Compose。"
  exit 1
fi

if [ ! -S /var/run/docker.sock ]; then
  echo "警告: /var/run/docker.sock 不存在，DockLens 可能无法读取容器数据。"
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已生成 .env，可按需修改。"
fi

FILE_VERSION="$(cat VERSION 2>/dev/null || true)"
if [ -n "$FILE_VERSION" ]; then
  if ! grep -q '^DOCKLENS_VERSION=' .env || grep -q '^DOCKLENS_VERSION=$' .env; then
    if grep -q '^DOCKLENS_VERSION=' .env; then
      sed -i.bak "s/^DOCKLENS_VERSION=.*/DOCKLENS_VERSION=${FILE_VERSION}/" .env
      rm -f .env.bak
    else
      printf '\nDOCKLENS_VERSION=%s\n' "$FILE_VERSION" >> .env
    fi
  fi
fi

VERSION="$(sed -n 's/^DOCKLENS_VERSION=//p' .env | tail -n 1)"
VERSION="${VERSION:-latest}"
PORT="$(sed -n 's/^DOCKLENS_PORT=//p' .env | tail -n 1)"
BIND="$(sed -n 's/^DOCKLENS_BIND=//p' .env | tail -n 1)"
PORT="${PORT:-7577}"
BIND="${BIND:-0.0.0.0}"

if [ "$PULL_IMAGE" = "true" ]; then
  echo "拉取预构建镜像并启动 DockLens..."
  docker compose -f "$COMPOSE_FILE" pull docklens
  docker compose -f "$COMPOSE_FILE" up -d
elif [ -n "$BUILD_FLAG" ]; then
  echo "使用 $COMPOSE_FILE 构建并启动 DockLens..."
  docker compose -f "$COMPOSE_FILE" up -d --build
else
  echo "使用 $COMPOSE_FILE 启动 DockLens..."
  docker compose -f "$COMPOSE_FILE" up -d
fi

docker compose -f "$COMPOSE_FILE" ps

if [ "$BIND" = "127.0.0.1" ]; then
  echo "已启动 DockLens ${VERSION}: http://127.0.0.1:${PORT}"
else
  echo "已启动 DockLens ${VERSION}: http://<本机局域网IP>:${PORT}"
fi

if [ "$MODE" = "full" ] || [ "$MODE" = "--full" ]; then
  echo "完整模式已开启：宿主机监听扫描在同一容器内运行。"
fi
