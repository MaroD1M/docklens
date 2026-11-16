.PHONY: web build test lint dev dev-backend docker up pull down ps logs full-up full-down install uninstall release clean

VERSION ?= $(shell cat VERSION 2>/dev/null || echo dev)
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
BUILD_DATE ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS = -s -w \
	-X github.com/MaroD1M/docklens/internal/version.Version=$(VERSION) \
	-X github.com/MaroD1M/docklens/internal/version.Commit=$(COMMIT) \
	-X github.com/MaroD1M/docklens/internal/version.BuildDate=$(BUILD_DATE)

web:
	cd web && npm ci && npm run build

build: web
	mkdir -p bin
	CGO_ENABLED=0 go build -trimpath -ldflags="$(LDFLAGS)" -o bin/docklens ./cmd/docklens

test:
	go test ./...

lint:
	cd web && npm run typecheck
	go vet ./...

dev:
	cd web && npm run dev

dev-backend:
	go run ./cmd/docklens

docker:
	docker build \
		--build-arg VERSION=$(VERSION) \
		--build-arg COMMIT=$(COMMIT) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		-t docklens:$(VERSION) .

up:
	docker compose up -d --build

pull:
	docker compose -f docker-compose.pull.yml pull
	docker compose -f docker-compose.pull.yml up -d

down:
	docker compose down

ps:
	docker compose ps

logs:
	docker compose logs -f --tail=200

full-up:
	docker compose -f docker-compose.full.yml up -d --build

full-down:
	docker compose -f docker-compose.full.yml down

install:
	./scripts/install.sh

uninstall:
	./scripts/uninstall.sh

release:
	./scripts/release.sh

clean:
	rm -rf bin web/dist
	mkdir -p web/dist
	touch web/dist/.gitkeep
