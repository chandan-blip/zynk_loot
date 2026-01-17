#!/bin/bash

echo "Starting LOOT in development mode..."
echo ""

# Copy env file if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env file from example"
fi

# Start Docker containers
docker compose -f docker-compose.dev.yml up --build

echo ""
echo "Development servers:"
echo "  Frontend:    http://localhost:3000"
echo "  Backend API: http://localhost:5000"
echo "  phpMyAdmin:  http://localhost:3305"
echo "  Admin Panel: http://localhost:3000/admin/login"
