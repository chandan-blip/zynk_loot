#!/bin/bash

echo "Stopping LOOT containers..."

# Stop dev containers
docker compose -f docker-compose.dev.yml down 2>/dev/null

# Stop prod containers
docker compose -f docker-compose.prod.yml down 2>/dev/null

echo "All containers stopped."
