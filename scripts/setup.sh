#!/bin/bash
# ============================================================================
# Development Environment Setup Script
# Vape Shop Management System
# ============================================================================

set -e

echo "================================================"
echo "  Vape Shop Management System - Setup"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Start dependencies (PostgreSQL + Redis) via Docker
echo -e "${YELLOW}[1/5] Starting PostgreSQL and Redis...${NC}"
docker compose -f docker-compose.dev.yml up -d
echo -e "${GREEN}✓ Dependencies started${NC}"
echo ""

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
sleep 5

# Step 2: Backend setup
echo -e "${YELLOW}[2/5] Setting up backend...${NC}"
cd backend

if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✓ Created backend/.env${NC}"
fi

npm install
echo -e "${GREEN}✓ Backend dependencies installed${NC}"
echo ""

# Step 3: Database setup
echo -e "${YELLOW}[3/5] Setting up database...${NC}"
npx prisma generate
npx prisma migrate dev --name init
echo -e "${GREEN}✓ Database migrations applied${NC}"
echo ""

# Step 4: Seed database
echo -e "${YELLOW}[4/5] Seeding database...${NC}"
npx prisma db seed
echo -e "${GREEN}✓ Database seeded${NC}"
echo ""

# Step 5: Frontend setup
echo -e "${YELLOW}[5/5] Setting up frontend...${NC}"
cd ../frontend

if [ ! -f .env.local ]; then
    cp .env.example .env.local 2>/dev/null || echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > .env.local
    echo -e "${GREEN}✓ Created frontend/.env.local${NC}"
fi

if [ -f package.json ]; then
    npm install
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
fi

cd ..

echo ""
echo "================================================"
echo -e "${GREEN}  Setup complete!${NC}"
echo "================================================"
echo ""
echo "To start development:"
echo "  Backend:  cd backend && npm run start:dev"
echo "  Frontend: cd frontend && npm run dev"
echo ""
echo "Default login: owner@vapeshop.com / ChangeMe123!"
echo ""
