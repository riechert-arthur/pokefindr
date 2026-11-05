# Local development. `make setup` gets a fresh or stale clone to a working state,
# and running it again changes nothing. See docs/database.md.

SHELL := /bin/bash
.DEFAULT_GOAL := help
# Each step depends on the one before it (the database must be up before migrating).
.NOTPARALLEL:

APP_IMAGE := pokefindr:latest
DB_IMAGE := postgis/postgis:16-3.4
# Override if 5433 is taken: make setup DB_PORT=5434 (and use that port in .env.local).
DB_PORT ?= 5433
export DB_PORT
LOCAL_DATABASE_URL := postgres://pokefindr:pokefindr@localhost:$(DB_PORT)/pokefindr

# db:* scripts read .env.local, which may point at a remote database. These
# targets always use the local one. DATABASE_URL_UNPOOLED is set too because
# migrations prefer it over DATABASE_URL.
LOCAL_DB := DATABASE_URL=$(LOCAL_DATABASE_URL) DATABASE_URL_UNPOOLED=$(LOCAL_DATABASE_URL)

.PHONY: help setup dev-db images env deps db migrate seed reset-db shell preflight

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-9s %s\n", $$1, $$2}'

setup: images dev-db ## Everything: images, .env.local, npm deps, database, migrations, seed data
	@echo "Setup done. Start the app with: npm run dev"

dev-db: env deps db migrate seed ## Same as setup, without building the dev shell image

images: preflight ## Build the dev shell image and pull the PostGIS image
	docker build -t $(APP_IMAGE) .
	@docker image inspect $(DB_IMAGE) >/dev/null 2>&1 || docker pull $(DB_IMAGE)

env: ## Create .env.local if it doesn't exist (never overwrites it)
	@scripts/dev/env.sh "$(LOCAL_DATABASE_URL)"

deps: node_modules/.package-lock.json ## Run npm ci if package-lock.json changed since the last install

# npm writes node_modules/.package-lock.json on every install, so this reruns
# only when package-lock.json is newer.
node_modules/.package-lock.json: package-lock.json
	npm ci --no-audit --no-fund
	@touch $@

db: preflight ## Start PostGIS on localhost:5433 (no-op if it's already running)
	docker compose up -d --wait db

migrate: deps db ## Apply pending migrations, then check the database matches the schema
	@$(LOCAL_DB) npm run --silent db:migrate
	@$(LOCAL_DB) npm run --silent db:check

seed: migrate ## Upsert the fixture locations in database/seeds
	@$(LOCAL_DB) npm run --silent db:seed

reset-db: preflight ## DESTRUCTIVE: delete the local database volume, then run setup
	@echo "Deleting the local database (docker volume pokefindr_pokefindr-db)..."
	docker compose down -v
	@$(MAKE) --no-print-directory setup

shell: images ## Open a shell in the dev image with the repo mounted at /workspace
	docker run -it --rm -p 3000:3000 -v "$(CURDIR)":/workspace $(APP_IMAGE)

preflight:
	@scripts/dev/preflight.sh $(DB_PORT)
