#!/bin/bash

echo "Starting LOOT in production mode..."
echo ""

# Check for .env file
if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    echo "Please create a .env file with production settings."
    exit 1
fi

# Start Docker containers
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "Production servers started!"
echo "  Main App:    http://localhost"
echo "  phpMyAdmin:  http://localhost:3305"
echo "  Admin Panel: http://localhost/admin/login"
