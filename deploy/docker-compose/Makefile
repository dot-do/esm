# Makefile for esm.do Docker Compose operations
# Convenience commands for local development and deployment

.PHONY: help dev prod build logs clean stop restart shell test health ps

# Default target
.DEFAULT_GOAL := help

# Project name for docker-compose
PROJECT_NAME := esm-do

# Docker compose files
COMPOSE_BASE := -f docker-compose.yml
COMPOSE_DEV := $(COMPOSE_BASE) -f docker-compose.dev.yml
COMPOSE_PROD := $(COMPOSE_BASE) -f docker-compose.prod.yml

# Colors for output
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
RESET := \033[0m

## help: Show this help message
help:
	@echo "$(CYAN)ESM.do Docker Compose Commands$(RESET)"
	@echo ""
	@echo "$(GREEN)Development:$(RESET)"
	@echo "  make dev         Start development environment with hot reload"
	@echo "  make dev-build   Build and start development environment"
	@echo "  make shell       Open shell in esm-do container"
	@echo "  make test        Run tests in container"
	@echo ""
	@echo "$(GREEN)Production:$(RESET)"
	@echo "  make prod        Start production environment"
	@echo "  make prod-build  Build and start production environment"
	@echo ""
	@echo "$(GREEN)General:$(RESET)"
	@echo "  make build       Build all Docker images"
	@echo "  make logs        View logs (follow mode)"
	@echo "  make logs-all    View all logs (no follow)"
	@echo "  make ps          Show running containers"
	@echo "  make stop        Stop all services"
	@echo "  make restart     Restart all services"
	@echo "  make clean       Stop and remove containers, networks, volumes"
	@echo "  make health      Check service health status"
	@echo ""
	@echo "$(GREEN)Database:$(RESET)"
	@echo "  make db-shell    Open PostgreSQL shell"
	@echo "  make redis-cli   Open Redis CLI"
	@echo ""
	@echo "$(YELLOW)Environment:$(RESET)"
	@echo "  Copy .env.example to .env and customize before running"

## dev: Start development environment with hot reload
dev:
	@echo "$(CYAN)Starting development environment...$(RESET)"
	@if [ ! -f .env ]; then cp .env.example .env; echo "$(YELLOW)Created .env from .env.example$(RESET)"; fi
	docker compose -p $(PROJECT_NAME) $(COMPOSE_DEV) up -d
	@echo "$(GREEN)Development environment started!$(RESET)"
	@echo "Worker available at: http://localhost:$${ESM_PORT:-8787}"
	@echo "Debug port: $${DEBUG_PORT:-9229}"

## dev-build: Build and start development environment
dev-build:
	@echo "$(CYAN)Building and starting development environment...$(RESET)"
	@if [ ! -f .env ]; then cp .env.example .env; echo "$(YELLOW)Created .env from .env.example$(RESET)"; fi
	docker compose -p $(PROJECT_NAME) $(COMPOSE_DEV) up -d --build
	@echo "$(GREEN)Development environment started!$(RESET)"

## prod: Start production environment
prod:
	@echo "$(CYAN)Starting production environment...$(RESET)"
	@if [ ! -f .env ]; then echo "$(RED)Error: .env file required for production$(RESET)"; exit 1; fi
	docker compose -p $(PROJECT_NAME) $(COMPOSE_PROD) up -d
	@echo "$(GREEN)Production environment started!$(RESET)"

## prod-build: Build and start production environment
prod-build:
	@echo "$(CYAN)Building and starting production environment...$(RESET)"
	@if [ ! -f .env ]; then echo "$(RED)Error: .env file required for production$(RESET)"; exit 1; fi
	docker compose -p $(PROJECT_NAME) $(COMPOSE_PROD) up -d --build
	@echo "$(GREEN)Production environment started!$(RESET)"

## build: Build all Docker images
build:
	@echo "$(CYAN)Building Docker images...$(RESET)"
	docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) build
	@echo "$(GREEN)Build complete!$(RESET)"

## build-dev: Build development Docker images
build-dev:
	@echo "$(CYAN)Building development Docker images...$(RESET)"
	docker compose -p $(PROJECT_NAME) $(COMPOSE_DEV) build
	@echo "$(GREEN)Build complete!$(RESET)"

## build-prod: Build production Docker images
build-prod:
	@echo "$(CYAN)Building production Docker images...$(RESET)"
	docker compose -p $(PROJECT_NAME) $(COMPOSE_PROD) build
	@echo "$(GREEN)Build complete!$(RESET)"

## logs: View logs (follow mode)
logs:
	docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) logs -f

## logs-all: View all logs (no follow)
logs-all:
	docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) logs

## logs-esm: View esm-do service logs only
logs-esm:
	docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) logs -f esm-do

## ps: Show running containers
ps:
	docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) ps

## stop: Stop all services
stop:
	@echo "$(CYAN)Stopping services...$(RESET)"
	docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) stop
	@echo "$(GREEN)Services stopped!$(RESET)"

## restart: Restart all services
restart:
	@echo "$(CYAN)Restarting services...$(RESET)"
	docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) restart
	@echo "$(GREEN)Services restarted!$(RESET)"

## clean: Stop and remove containers, networks, volumes
clean:
	@echo "$(YELLOW)Stopping and removing all containers, networks, and volumes...$(RESET)"
	docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) down -v --remove-orphans
	@echo "$(GREEN)Cleanup complete!$(RESET)"

## clean-all: Remove everything including images
clean-all: clean
	@echo "$(YELLOW)Removing Docker images...$(RESET)"
	docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) down --rmi all
	@echo "$(GREEN)Full cleanup complete!$(RESET)"

## shell: Open shell in esm-do container
shell:
	docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) exec esm-do sh

## test: Run tests in container
test:
	docker compose -p $(PROJECT_NAME) $(COMPOSE_DEV) exec esm-do npm test

## health: Check service health status
health:
	@echo "$(CYAN)Checking service health...$(RESET)"
	@echo ""
	@echo "ESM.do Worker:"
	@curl -s http://localhost:$${ESM_PORT:-8787}/health || echo "$(RED)Not responding$(RESET)"
	@echo ""
	@echo ""
	@echo "Redis:"
	@docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) exec -T redis redis-cli ping || echo "$(RED)Not responding$(RESET)"
	@echo ""
	@echo "PostgreSQL:"
	@docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) exec -T postgres pg_isready -U $${POSTGRES_USER:-esm} || echo "$(RED)Not responding$(RESET)"

## db-shell: Open PostgreSQL shell
db-shell:
	docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) exec postgres psql -U $${POSTGRES_USER:-esm} -d $${POSTGRES_DB:-esm}

## redis-cli: Open Redis CLI
redis-cli:
	docker compose -p $(PROJECT_NAME) $(COMPOSE_BASE) exec redis redis-cli
