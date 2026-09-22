# Quick Start Guide

Get the Vape Shop Management System running in 15 minutes.

## Prerequisites

Before you begin, ensure you have the following installed:

- ✅ **Node.js** 20+ LTS ([Download](https://nodejs.org/))
- ✅ **PostgreSQL** 15+ ([Download](https://www.postgresql.org/download/))
- ✅ **Redis** 7+ ([Download](https://redis.io/download))
- ✅ **Git** ([Download](https://git-scm.com/downloads))
- ✅ **Docker & Docker Compose** (recommended) ([Download](https://www.docker.com/))

## Option 1: Quick Start with Docker (Recommended)

The fastest way to get started:

### Step 1: Clone & Setup

```bash
# Clone the repository
git clone <repository-url>
cd vape-shop-system

# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

### Step 2: Start Services

```bash
# Start all services (PostgreSQL, Redis, Backend, Frontend, Nginx)
docker-compose up -d

# Watch logs
docker-compose logs -f
```

### Step 3: Initialize Database

```bash
# Run migrations and seed data
docker-compose exec backend npm run prisma:migrate:deploy
docker-compose exec backend npm run db:seed
```

### Step 4: Access Application

- **Frontend:** http://localhost (or http://localhost:3000)
- **Backend API:** http://localhost:4000
- **API Documentation:** http://localhost:4000/api/docs

**Default Login:**
- Email: `admin@vapeshop.com`
- Password: `ChangeMe123!`

---

## Option 2: Manual Setup (Development)

For active development:

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd vape-shop-system
```

### Step 2: Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

cd ..
```

### Step 3: Configure Environment

**Backend (.env):**
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/vape_shop_db"
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-super-secret-key-change-this
```

**Frontend (.env.local):**
```bash
cd frontend
cp .env.example .env.local
```

Edit `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

### Step 4: Setup Database

Make sure PostgreSQL is running, then:

```bash
cd backend

# Create database (if needed)
# createdb vape_shop_db

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database with initial data
npm run db:seed
```

### Step 5: Setup Redis

Make sure Redis is running:

```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG
```

If not running:
```bash
# macOS (Homebrew)
brew services start redis

# Linux
sudo systemctl start redis

# Windows
# Start Redis from installation directory
```

### Step 6: Start Development Servers

**Option A: Start all at once (from root):**
```bash
npm run dev
```

**Option B: Start individually:**

Terminal 1 - Backend:
```bash
cd backend
npm run start:dev
```

Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

### Step 7: Access Application

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:4000
- **API Docs:** http://localhost:4000/api/docs
- **Prisma Studio:** `cd backend && npx prisma studio` (http://localhost:5555)

---

## Default User

The database seeds a single **Admin** account to bootstrap login. Create
shops, staff and additional admins from inside the app afterwards.

| Role | Email | Password | Access Level |
|------|-------|----------|--------------|
| **Admin** | admin@vapeshop.com | ChangeMe123! | Full system access |

⚠️ **IMPORTANT:** Change this password immediately after first login.

---

## Verify Installation

### 1. Check Backend Health

```bash
curl http://localhost:4000/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "redis": "healthy"
  }
}
```

### 2. Check Database

```bash
cd backend
npx prisma studio
```

Should open Prisma Studio in your browser showing all tables with data.

### 3. Test Login

1. Go to http://localhost:3000
2. Enter credentials: `admin@vapeshop.com` / `ChangeMe123!`
3. You should see the dashboard

---

## Common Issues & Solutions

### Issue: "Port 3000 is already in use"

```bash
# Find and kill process using port 3000
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Issue: Every page shows "database error" (code SCHEMA_OUT_OF_DATE)

This means the API connected to the database but the tables/columns it needs
don't exist yet — the migrations haven't been applied. Confirm with:

```bash
curl http://localhost:4000/health
# look for  "schema": "migrations_pending"
```

Fix it by applying migrations (and seeding the Owner account), then restart:

```bash
cd backend
npx prisma migrate deploy   # or: npx prisma migrate dev  (for local dev)
npx prisma generate
npm run prisma:seed
```

If `curl http://localhost:4000/health` instead shows `"database": "unreachable"`,
PostgreSQL isn't running or `DATABASE_URL` in `backend/.env` is wrong.

### Issue: "Cannot connect to PostgreSQL"

```bash
# Check if PostgreSQL is running
# macOS
brew services list

# Linux
sudo systemctl status postgresql

# Test connection
psql -U postgres -h localhost
```

### Issue: "Prisma Client not generated"

```bash
cd backend
npx prisma generate
```

### Issue: "Redis connection failed"

```bash
# Check if Redis is running
redis-cli ping

# If not running, start it
# macOS
brew services start redis

# Linux
sudo systemctl start redis
```

### Issue: "Module not found" errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Or in backend/frontend
cd backend && rm -rf node_modules && npm install
cd frontend && rm -rf node_modules && npm install
```

---

## Next Steps

### 1. Explore the Dashboard

- View sales metrics
- Check inventory levels
- Review recent transactions
- Explore reports

### 2. Create Your First Product

1. Navigate to **Products**
2. Click **New Product**
3. Fill in product details
4. Add variants (SKU, price, etc.)
5. Click **Save**

### 3. Make a Sale

1. Navigate to **Sales** → **New Sale**
2. Select products
3. Enter quantities
4. Verify age (if required)
5. Process payment
6. View receipt

### 4. Review Documentation

- **[Full Documentation](docs/INDEX.md)** - Complete technical docs
- **[API Reference](docs/api/04-api-design-specifications.md)** - API endpoints
- **[Database Schema](docs/database/03-database-schema-design.md)** - Data model
- **[Security Guide](docs/security/05-security-architecture.md)** - Security best practices

### 5. Customize Settings

1. Go to **Settings**
2. Update shop name
3. Configure tax rate
4. Set up notification preferences
5. Customize system settings

---

## Development Workflow

### Running Tests

```bash
# Backend tests
cd backend
npm run test              # Unit tests
npm run test:e2e          # E2E tests
npm run test:cov          # Coverage report

# Frontend tests
cd frontend
npm run test
```

### Linting & Formatting

```bash
# From root
npm run lint              # Lint all
npm run format            # Format all

# Individual
cd backend && npm run lint
cd frontend && npm run lint
```

### Database Management

```bash
cd backend

# View database in browser
npx prisma studio

# Create new migration
npx prisma migrate dev --name migration_name

# Reset database (CAUTION: deletes all data)
npx prisma migrate reset
```

### Building for Production

```bash
# Build all
npm run build

# Or individually
cd backend && npm run build
cd frontend && npm run build
```

---

## Getting Help

- **Documentation:** [docs/INDEX.md](docs/INDEX.md)
- **API Docs:** http://localhost:4000/api/docs (when running)
- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions

---

## What's Next?

- ✅ **Configure System:** Update settings for your shop
- ✅ **Add Products:** Build your product catalog
- ✅ **Train Staff:** Share login credentials and train on POS
- ✅ **Test Workflows:** Try creating sales, receiving inventory
- ✅ **Review Security:** Change default passwords, review security settings
- ✅ **Setup Backups:** Configure automated database backups
- ✅ **Plan Production:** Review deployment guide for going live

---

**Ready to deploy to production?** See [Deployment Guide](docs/deployment/deployment-guide.md)

**Need more details?** Check the [Full Documentation](docs/INDEX.md)

---

Happy coding! 🚀
