.PHONY: help build run dev test lint migrate-up migrate-down migrate-create \
        docker-build docker-up docker-down docker-logs clean fmt vet

# ─── Variables ────────────────────────────────────────────────────────────────
APP_NAME     := quizgen
CMD_DIR      := ./cmd/server
BIN_DIR      := ./bin
BIN          := $(BIN_DIR)/$(APP_NAME)
MIGRATIONS   := ./migrations
DB_URL       ?= $(shell grep -E '^DB_' .env | xargs | sed 's/ /\&/g')

# Read .env if it exists
ifneq (,$(wildcard .env))
    include .env
    export
endif

DB_DSN := postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=$(DB_SSLMODE)

# ─── Help ─────────────────────────────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ─── Build ────────────────────────────────────────────────────────────────────
build: ## Build the binary
	@echo "→ Building $(APP_NAME)..."
	@mkdir -p $(BIN_DIR)
	CGO_ENABLED=0 go build -ldflags="-w -s" -o $(BIN) $(CMD_DIR)
	@echo "✓ Binary: $(BIN)"

run: build ## Build and run locally (requires running Postgres)
	$(BIN)

dev: ## Run with live reload using Air
	air -c .air.toml

# ─── Code quality ─────────────────────────────────────────────────────────────
fmt: ## Format code
	gofmt -w .
	goimports -w . 2>/dev/null || true

vet: ## Run go vet
	go vet ./...

lint: ## Run golangci-lint
	golangci-lint run ./...

test: ## Run all tests
	go test -v -race -coverprofile=coverage.out ./...

test-cover: test ## Open test coverage report
	go tool cover -html=coverage.out

# ─── Database migrations ──────────────────────────────────────────────────────
migrate-up: ## Apply all pending migrations
	@echo "→ Running migrations UP..."
	go run ./scripts/migrate/main.go up

migrate-down: ## Roll back last migration
	@echo "→ Running migrations DOWN..."
	go run ./scripts/migrate/main.go down

migrate-create: ## Create new migration: make migrate-create NAME=add_something
	@if [ -z "$(NAME)" ]; then echo "Usage: make migrate-create NAME=description"; exit 1; fi
	@TIMESTAMP=$$(date +%Y%m%d%H%M%S); \
	 touch $(MIGRATIONS)/$${TIMESTAMP}_$(NAME).up.sql; \
	 touch $(MIGRATIONS)/$${TIMESTAMP}_$(NAME).down.sql; \
	 echo "✓ Created: $(MIGRATIONS)/$${TIMESTAMP}_$(NAME).{up,down}.sql"

migrate-status: ## Show migration status
	go run ./scripts/migrate/main.go status

# ─── Docker ───────────────────────────────────────────────────────────────────
docker-build: ## Build Docker image
	docker compose build

docker-up: ## Start all services (production-like)
	docker compose up -d
	@echo "✓ Services started. App: http://localhost:$(APP_PORT)"

docker-up-dev: ## Start all services in dev mode (with hot reload)
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up

docker-down: ## Stop all services
	docker compose down

docker-down-v: ## Stop all services and remove volumes
	docker compose down -v

docker-logs: ## Tail logs
	docker compose logs -f app

docker-ps: ## Show running containers
	docker compose ps

# ─── Utilities ────────────────────────────────────────────────────────────────
clean: ## Remove build artifacts
	rm -rf $(BIN_DIR) coverage.out tmp/

deps: ## Download Go modules
	go mod download
	go mod tidy

setup: deps ## Initial project setup (copy .env.example -> .env if missing)
	@if [ ! -f .env ]; then cp .env.example .env; echo "✓ Created .env from .env.example"; fi
	@mkdir -p $(BIN_DIR)

seed: ## Seed database with sample data
	go run ./scripts/seed/main.go
