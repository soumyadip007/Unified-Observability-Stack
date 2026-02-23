#!/bin/bash

# Development startup script
# Starts observability stack in Docker, then runs app and load-generator locally

set -e

echo "🚀 Starting Observability Stack (Docker)..."
docker compose -f docker-compose-dev.yml up -d

echo "⏳ Waiting for services to be healthy..."
sleep 5

echo "✅ Observability stack is running!"
echo ""
echo "📊 Access services:"
echo "   - Grafana: http://localhost:3000 (admin/admin)"
echo "   - Prometheus: http://localhost:9090"
echo ""
echo "🔧 Now run in separate terminals:"
echo "   Terminal 1: cd app && npm install && npm run dev"
echo "   Terminal 2: cd load-generator && npm install && npm run dev"
echo ""
echo "Press Ctrl+C to stop Docker services"

# Keep script running and handle cleanup
trap "echo '🛑 Stopping Docker services...'; docker compose -f docker-compose-dev.yml down; exit" INT TERM

# Wait for interrupt
wait
