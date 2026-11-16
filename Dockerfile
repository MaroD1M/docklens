FROM node:24-alpine AS web

WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.24-alpine AS build

ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_DATE=unknown

WORKDIR /src
COPY go.mod ./
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath \
    -ldflags="-s -w \
      -X github.com/MaroD1M/docklens/internal/version.Version=${VERSION} \
      -X github.com/MaroD1M/docklens/internal/version.Commit=${COMMIT} \
      -X github.com/MaroD1M/docklens/internal/version.BuildDate=${BUILD_DATE}" \
    -o /out/docklens ./cmd/docklens

FROM gcr.io/distroless/static-debian12:latest

ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="DockLens" \
      org.opencontainers.image.description="Read-only Docker container IP and port visualization dashboard" \
      org.opencontainers.image.url="https://github.com/MaroD1M/docklens" \
      org.opencontainers.image.source="https://github.com/MaroD1M/docklens" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.authors="MaroD1M" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT}" \
      org.opencontainers.image.created="${BUILD_DATE}"

COPY --from=build /out/docklens /docklens

ENV DOCKLENS_LISTEN=0.0.0.0:7577 \
    DOCKLENS_DATA_DIR=/data \
    DOCKER_HOST=unix:///var/run/docker.sock \
    DOCKLENS_REFRESH=30

EXPOSE 7577
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/docklens", "healthcheck"]

ENTRYPOINT ["/docklens"]
