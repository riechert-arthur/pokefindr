# Local development. Everything runs in Docker (docker-compose.yml); the host
# only needs Docker and make.
#
#   make run     start or update the whole stack (safe to rerun at any time)
#
# See docs/database.md.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Override if a port is taken, e.g. make run WEB_PORT=3001
DB_PORT ?= 5433
WEB_PORT ?= 3000
STORYBOOK_PORT ?= 6006
MAIL_UI_PORT ?= 8025
MAIL_SMTP_PORT ?= 1025
# Each git branch gets its own local database, so migrations tried on one
# branch never reach another (docs/database.md, "Branch databases").
DB_NAME ?= $(shell scripts/dev/db-name.sh)
export DB_PORT WEB_PORT STORYBOOK_PORT MAIL_UI_PORT MAIL_SMTP_PORT DB_NAME

.PHONY: help run stop logs shell prune fresh reset preflight env

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-6s %s\n", $$1, $$2}'

run: preflight env ## Start or update everything: db, migrations, seed data, web, Storybook (and workers)
	@# Mount points for the node_modules and .next volumes. Created here so
	@# Docker doesn't create them owned by root, which breaks a host npm install.
	@mkdir -p node_modules .next
	@# Build first, then a plain up. `up --build` makes some Compose v2
	@# releases recreate init and web even when the image didn't change.
	@docker compose build --quiet init
	@docker compose up --detach --wait || { \
	  echo; echo "Startup failed. Last output from init and web:"; \
	  docker compose logs --tail 40 init web storybook; exit 1; }
	@echo
	@echo "PokeFindr is running at http://localhost:$(WEB_PORT)"
	@echo "Storybook is running at http://localhost:$(STORYBOOK_PORT)"
	@echo "Emails the app sends land in Mailpit at http://localhost:$(MAIL_UI_PORT)"
	@echo "Database for this branch: postgres://pokefindr:pokefindr@localhost:$(DB_PORT)/$(DB_NAME)"
	@echo "Follow output with 'make logs'; stop with 'make stop'."

stop: ## Stop the stack (keeps the database)
	docker compose stop

logs: ## Follow output from every service
	docker compose logs --follow --tail 100

shell: ## Open a shell in the web container
	docker compose exec web bash

prune: preflight ## Drop databases of local git branches that no longer exist
	@docker compose up --detach --wait db >/dev/null 2>&1
	@scripts/dev/prune.sh

fresh: preflight ## Delete this branch's database (only this one) and its data, then run, recreating it as on the branch's first run
	@docker compose up --detach --wait db >/dev/null 2>&1
	@echo "Dropping $(DB_NAME)..."
	@docker compose exec -T db psql -U pokefindr -d postgres -v ON_ERROR_STOP=1 -qc 'drop database if exists "$(DB_NAME)" with (force)'
	@$(MAKE) --no-print-directory run

reset: preflight ## DESTRUCTIVE: delete all local databases and installed dependencies, then run
	@echo "Deleting the local database and dependency volumes..."
	docker compose down --volumes
	@$(MAKE) --no-print-directory run

preflight:
	@scripts/dev/preflight.sh

env:
	@scripts/dev/env.sh
