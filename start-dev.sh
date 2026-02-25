#!/bin/bash

# Development startup script
# Starts observability stack in Docker, then runs app and load-generator locally

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down...${NC}"
    
    # Kill background processes
    if [ ! -z "$APP_PID" ]; then
        echo "   Stopping app (PID: $APP_PID)"
        kill $APP_PID 2>/dev/null || true
    fi
    
    if [ ! -z "$LOADGEN_PID" ]; then
        echo "   Stopping load-generator (PID: $LOADGEN_PID)"
        kill $LOADGEN_PID 2>/dev/null || true
    fi
    
    # Stop Docker services
    echo "   Stopping Docker services..."
    docker compose -f docker-compose-dev.yml down
    
    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

# Set up trap for cleanup
trap cleanup INT TERM

echo -e "${BLUE}🚀 Starting Observability Stack (Docker)...${NC}"
docker compose -f docker-compose-dev.yml up -d

echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 5

echo -e "${GREEN}✅ Observability stack is running!${NC}"
echo ""
echo -e "${BLUE}📊 Access services:${NC}"
echo "   - Grafana: http://localhost:3000 (admin/admin)"
echo "   - Prometheus: http://localhost:9090"
echo "   - App metrics: via OTel only → http://localhost:8889/metrics (collector)"
echo ""

# Install app dependencies if needed
if [ ! -d "app/node_modules" ]; then
    echo -e "${YELLOW}📦 Installing app dependencies...${NC}"
    cd app
    npm install
    cd ..
fi

# Install load-generator dependencies if needed
if [ ! -d "load-generator/node_modules" ]; then
    echo -e "${YELLOW}📦 Installing load-generator dependencies...${NC}"
    cd load-generator
    npm install
    cd ..
fi

# Start app in background
echo -e "${GREEN}🚀 Starting app...${NC}"
cd app
npm run dev > ../app.log 2>&1 &
APP_PID=$!
cd ..

# Wait a bit for app to start
sleep 2

# Start load-generator in background
echo -e "${GREEN}🚀 Starting load-generator...${NC}"
cd load-generator
npm run dev > ../load-generator.log 2>&1 &
LOADGEN_PID=$!
cd ..

echo ""
echo -e "${GREEN}✅ All services started!${NC}"
echo ""
echo -e "${BLUE}📝 Logs:${NC}"
echo "   - App: tail -f app.log"
echo "   - Load Generator: tail -f load-generator.log"
echo "   - Docker: docker compose -f docker-compose-dev.yml logs -f"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for processes
wait $APP_PID $LOADGEN_PID
