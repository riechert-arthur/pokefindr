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
export DB_PORT WEB_PORT

.PHONY: help run stop logs shell reset preflight env

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-6s %s\n", $$1, $$2}'

run: preflight env ## Start or update everything: db, migrations, seed data, web (and workers)
	@# Mount points for the node_modules and .next volumes. Created here so
	@# Docker doesn't create them owned by root, which breaks a host npm install.
	@mkdir -p node_modules .next
	@docker compose up --build --detach --wait || { \
	  echo; echo "Startup failed. Last output from init and web:"; \
	  docker compose logs --tail 40 init web; exit 1; }
	@echo
	@echo "PokeFindr is running at http://localhost:$(WEB_PORT)"
	@echo "Follow output with 'make logs'; stop with 'make stop'."

stop: ## Stop the stack (keeps the database)
	docker compose stop

logs: ## Follow output from every service
	docker compose logs --follow --tail 100

shell: ## Open a shell in the web container
	docker compose exec web bash

reset: preflight ## DESTRUCTIVE: delete the local database and installed dependencies, then run
	@echo "Deleting the local database and dependency volumes..."
	docker compose down --volumes
	@$(MAKE) --no-print-directory run

preflight:
	@scripts/dev/preflight.sh

env:
	@scripts/dev/env.sh
