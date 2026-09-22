# Vape Shop Backend API

NestJS + TypeScript + Prisma + PostgreSQL backend for the Vape Shop Management System.

## Features Implemented

- ✅ **Authentication** - JWT access + refresh tokens, HTTP-only cookies, bcrypt
- ✅ **Account Security** - Account lockout after 5 failed attempts, session management
- ✅ **User Management** - Full CRUD with role-based access control
- ✅ **RBAC** - Owner / Admin / Staff roles with guards
- ✅ **Global Error Handling** - Consistent error envelope, Prisma error mapping
- ✅ **Response Transformation** - Standard success envelope with request IDs
- ✅ **Rate Limiting** - Throttler guard (100 req/min default)
- ✅ **Security Headers** - Helmet
- ✅ **Audit Logging** - Login, logout, user changes tracked
- ✅ **API Documentation** - Swagger/OpenAPI at `/api/docs`

## Prerequisites

- Node.js 20+ LTS
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)

## Quick Start

### 1. Start dependencies (PostgreSQL + Redis)

From the project root:

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2. Install dependencies

```bash
cd backend
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env if needed - defaults work with docker-compose.dev.yml
```

### 4. Set up the database

```bash
# Generate Prisma client
npx prisma generate

# Create and apply migrations
npx prisma migrate dev --name init

# Seed initial data (roles, users, categories, settings)
npx prisma db seed
```

### 5. Start the server

```bash
npm run start:dev
```

The API will be available at:
- **API:** http://localhost:4000/api/v1
- **Swagger Docs:** http://localhost:4000/api/docs
- **Health Check:** http://localhost:4000/api/v1/health

## Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Owner | owner@vapeshop.com | ChangeMe123! |
| Admin | admin@vapeshop.com | ChangeMe123! |
| Staff | staff@vapeshop.com | ChangeMe123! |

⚠️ Change these immediately in production.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start with hot reload |
| `npm run start:prod` | Start production build |
| `npm run build` | Build for production |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run E2E tests |
| `npm run test:cov` | Run tests with coverage |
| `npm run lint` | Lint and fix |
| `npm run prisma:studio` | Open Prisma Studio GUI |
| `npm run prisma:migrate:dev` | Create/apply migration |

## API Endpoints (Implemented)

### Authentication
- `POST /api/v1/auth/login` - Login (returns access token + sets refresh cookie)
- `POST /api/v1/auth/logout` - Logout (clears session)
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/change-password` - Change password
- `GET /api/v1/auth/me` - Get current user

### Users (Owner/Admin)
- `GET /api/v1/users` - List users (paginated, searchable)
- `GET /api/v1/users/roles` - List roles
- `GET /api/v1/users/:id` - Get user
- `POST /api/v1/users` - Create user
- `PATCH /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user (Owner only)

### System
- `GET /api/v1/health` - Health check
- `GET /api/v1/version` - Version info

## Testing the API

### Login

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@vapeshop.com","password":"ChangeMe123!"}'
```

### Use the access token

```bash
curl http://localhost:4000/api/v1/users \
  -H "Authorization: Bearer <your-access-token>"
```

## Project Structure

```
src/
├── main.ts                 # Entry point, global config
├── app.module.ts           # Root module
├── common/                 # Shared code
│   ├── decorators/         # @Roles, @Public, @CurrentUser
│   ├── filters/            # Exception filters
│   ├── guards/             # RolesGuard
│   ├── interceptors/       # Transform, Logging
│   ├── interfaces/         # Shared types
│   ├── middleware/         # Request ID
│   └── utils/              # Hash, string utils
├── modules/
│   ├── auth/               # Authentication
│   └── users/              # User management
└── prisma/                 # Prisma service
```

## Architecture Notes

- **Global JwtAuthGuard:** All routes require auth by default. Use `@Public()` to opt out.
- **Global ThrottlerGuard:** Rate limiting applied globally.
- **Response envelope:** All responses wrapped in `{ success, data, meta }`.
- **Soft deletes:** Users use `deletedAt` instead of hard deletion.

## Production database & connection pooling (Supabase)

The app runs migrations on boot (`runMigrationsOnBoot()` in `src/main.ts`), then
serves traffic. On Supabase, the two jobs want **different** connections:

| Job | Connection | Port | Why |
| --- | --- | --- | --- |
| App runtime queries | Transaction pooler | `6543` | Scales to many concurrent clients (lots of branches/tabs). Add `?pgbouncer=true`. |
| Migrations + seed | Session pooler / direct | `5432` | The 6543 transaction pooler can't run Prisma migrations (advisory locks, prepared statements, session DDL). |

Set these env vars on the host (e.g. Render):

```bash
# What the running app uses for all normal queries — the fast transaction pooler
DATABASE_URL="postgresql://postgres.<ref>:<pw>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Used ONLY for boot migrations + seed — the 5432 session pooler
MIGRATE_DATABASE_URL="postgresql://postgres.<ref>:<pw>@<region>.pooler.supabase.com:5432/postgres"
```

If `MIGRATE_DATABASE_URL` is unset, migrations fall back to `DATABASE_URL` — so a
single-URL setup where `DATABASE_URL` is already a 5432 connection keeps working
unchanged. To skip in-app migrations entirely (e.g. run them from CI), set
`RUN_MIGRATIONS_ON_BOOT=false`.

## Next Modules To Implement

Following the implementation roadmap:
- Products & Variants
- Inventory & Inventory Logs
- Sales (POS)
- Reports & Dashboard
- Purchase Orders
- Customers
- WebSocket real-time updates

See `/docs/roadmap/07-implementation-roadmap.md` for the full plan.
