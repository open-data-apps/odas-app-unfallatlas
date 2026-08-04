#
# ODA Makefile
# (C) Ondics, 2026
#

DC = docker compose -f docker-compose.yml
ifeq ($(STANDALONE),true)
DC := ${DC} -f docker-compose.standalone.yml
endif

# aktuelles Dir ist docker-compose project name
mkfile_path := $(abspath $(lastword $(MAKEFILE_LIST)))
current_dir := $(notdir $(patsubst %/,%,$(dir $(mkfile_path))))

.PHONY: help up down logs config ps zip check-app

help: ## Alle oeffentlichen Befehle und ihre Beschreibung anzeigen
	@echo "# ODA Makefile"
	@echo "# Ondics, 2026"
	@echo Befehle: make ...
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.DEFAULT_GOAL := help

up: ## App starten (Standalone mit STANDALONE=true)
	${DC} up -d --build --remove-orphans

down: ## App stoppen (Standalone mit STANDALONE=true)
	${DC} down

logs: ## App-Logs anzeigen (Standalone mit STANDALONE=true)
	${DC} logs -f -t --tail=100

config: ## Aufgeloeste Compose-Konfiguration anzeigen
	${DC} config

ps: ## Containerstatus anzeigen (Standalone mit STANDALONE=true)
	${DC} ps

zip: ## App zur Auslieferung vorbereiten
	zip -FS -r ${current_dir}.zip \
	 	app assets app-package.json CHANGELOG.md

check-app: ## App prüfen mit Skript aus ODAS-Tools
	echo "App prüfen"
	./../odas-tools/app-check.sh
