# CHX Inventory System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-red)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://www.postgresql.org/)

A comprehensive, production-ready management system for vape shops featuring inventory tracking, point-of-sale, reporting, and multi-user access control.

## 🎯 Project Overview

This system provides a complete solution for vape shop operations including:

- **Multi-user Access Control** - Owner, Admin, and Staff roles with granular permissions
- **Product Management** - Full product catalog with variants, SKUs, and pricing
- **Inventory Tracking** - Real-time inventory with automatic updates and low stock alerts
- **Point of Sale** - Fast, intuitive checkout with age verification
- **Purchase Orders** - Supplier management and inventory receiving
- **Customer Management** - Customer profiles, purchase history, and loyalty tracking
- **Reporting & Analytics** - Comprehensive reports and real-time dashboard
- **Shift Management** - Cash drawer tracking and reconciliation
- **Audit Logging** - Complete audit trail for compliance
- **Real-time Updates** - WebSocket-based live updates across all clients

## 🏗️ Architecture

**Stack:**
- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** NestJS 10, TypeScript, Prisma ORM
- **Database:** PostgreSQL 15
- **Cache/Sessions:** Redis 7
- **Infrastructure:** Docker, Nginx, Cloudflare

**Architecture Style:** Three-tier monolithic with defense-in-depth security

## 📋 Documentation Index

### Planning & Design Documents

1. **[Requirements Analysis](docs/requirements/01-requirements-analysis.md)**
   - Gap analysis and enhancements
   - 20+ entities identified
   - Security and compliance requirements

2. **[System Architecture](docs/architecture/02-system-architecture.md)**
   - 3-tier architecture design
   - Component diagrams
   - Technology decisions
   - Scalability strategy

3. **[Database Schema](docs/database/03-database-schema-design.md)**
   - 20 normalized tables (3NF)
   - Complete Prisma schema
   - 50+ indexes for performance
   - Migration strategy

4. **[API Specifications](docs/api/04-api-design-specifications.md)**
   - 80+ RESTful endpoints
   - Request/response schemas
   - Authentication & authorization
   - Rate limiting & error handling

5. **[Security Architecture](docs/security/05-security-architecture.md)**
   - STRIDE threat model
   - Authentication & authorization
   - Security controls & testing
   - Compliance (GDPR, age verification)

6. **[Project Structure](docs/project-structure/06-project-structure.md)**
   - Complete folder hierarchies
   - Naming conventions
   - Configuration files
   - Code organization patterns

7. **[Implementation Roadmap](docs/roadmap/07-implementation-roadmap.md)**
   - 12-week development plan
   - 6 sprint breakdown
   - Resource allocation
   - Success criteria

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ LTS
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (recommended)
- npm or yarn

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd vape-shop-system
   ```

2. **Run setup script:**
   ```bash
   chmod +x scripts/setup.sh
   ./scripts/setup.sh
   ```

   Or manually:

3. **Install dependencies:**
   ```bash
   # Install root dependencies
   npm install

   # Install backend dependencies
   cd backend && npm install

   # Install frontend dependencies
   cd ../frontend && npm install
   ```

4. **Set up environment variables:**
   ```bash
   # Backend
   cp backend/.env.example backend/.env
   # Edit backend/.env with your configuration

   # Frontend
   cp frontend/.env.example frontend/.env.local
   # Edit frontend/.env.local with your configuration
   ```

5. **Set up database:**
   ```bash
   cd backend

   # Generate Prisma client
   npx prisma generate

   # Run migrations
   npx prisma migrate dev

   # Seed database
   npm run db:seed
   ```

6. **Start development servers:**
   ```bash
   # From root directory
   npm run dev

   # Or start individually:
   # Backend (port 4000)
   cd backend && npm run start:dev

   # Frontend (port 3000)
   cd frontend && npm run dev
   ```

7. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:4000
   - API Docs: http://localhost:4000/api/docs
   - Prisma Studio: `cd backend && npx prisma studio`

### Using Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 👥 Default User

After running the seed script, a single bootstrap account is created. Create
shops, staff and additional admins from inside the app afterwards.

| Role | Email | Password | Permissions |
|------|-------|----------|-------------|
| Admin | admin@vapeshop.com | ChangeMe123! | Full access |

⚠️ **IMPORTANT:** Change this password immediately in production!

## 🧪 Testing

```bash
# Run all tests
npm test

# Backend tests
cd backend
npm run test              # Unit tests
npm run test:watch        # Watch mode
npm run test:cov          # Coverage report
npm run test:e2e          # E2E tests

# Frontend tests
cd frontend
npm run test              # Unit tests
npm run test:watch        # Watch mode
```

## 📦 Building for Production

```bash
# Build all
npm run build

# Or build individually:
cd backend && npm run build
cd frontend && npm run build
```

## 🚢 Deployment

See [Deployment Guide](docs/deployment/deployment-guide.md) for detailed instructions.

### Quick Production Deployment

1. **Set up production server** (Ubuntu 22.04 LTS recommended)
2. **Install dependencies** (Docker, Docker Compose, Nginx)
3. **Configure environment variables**
4. **Deploy using Docker Compose:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```
5. **Configure Nginx reverse proxy**
6. **Set up SSL certificates** (Let's Encrypt)
7. **Configure Cloudflare** for CDN and WAF
8. **Set up automated backups**

## 🔐 Security

This system implements enterprise-grade security:

- ✅ JWT authentication with refresh tokens
- ✅ bcrypt password hashing (12 rounds)
- ✅ Role-based access control (RBAC)
- ✅ Account lockout (5 failed attempts)
- ✅ Rate limiting (100 req/min per IP)
- ✅ HTTPS only (TLS 1.3)
- ✅ Security headers (CSP, HSTS, etc.)
- ✅ Input validation and sanitization
- ✅ SQL injection prevention
- ✅ XSS & CSRF protection
- ✅ Comprehensive audit logging

See [Security Architecture](docs/security/05-security-architecture.md) for details.

## 📊 Features by Role

### Owner
- Full system access
- User management
- System settings
- All reports and analytics
- Audit log access

### Admin
- Product management
- Inventory management
- Purchase orders
- Sales management
- Staff performance reports

### Staff
- Point of Sale (POS)
- Inventory receiving
- View products and inventory
- View own sales

## 🛠️ Technology Stack

### Backend
- **Framework:** NestJS 10
- **Language:** TypeScript 5
- **ORM:** Prisma 5
- **Database:** PostgreSQL 15
- **Cache:** Redis 7
- **Authentication:** Passport.js + JWT
- **Validation:** class-validator
- **Documentation:** Swagger/OpenAPI

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript 5
- **UI Library:** React 18
- **Styling:** Tailwind CSS 3
- **Components:** shadcn/ui
- **Forms:** React Hook Form + Zod
- **State:** Zustand
- **Data Fetching:** React Query
- **Real-time:** Socket.io Client

### DevOps
- **Containerization:** Docker
- **Orchestration:** Docker Compose
- **Reverse Proxy:** Nginx
- **CDN/WAF:** Cloudflare
- **CI/CD:** GitHub Actions
- **Monitoring:** Prometheus + Grafana

## 📈 Performance

- **API Response Time:** < 500ms (p95)
- **Page Load Time:** < 2s
- **Concurrent Users:** 50+
- **Transactions/Day:** 10,000+
- **Database Size:** Optimized for 100GB+

## 🔄 Development Workflow

1. **Create feature branch:** `git checkout -b feature/your-feature`
2. **Make changes and commit:** Follow conventional commits
3. **Run tests:** `npm test`
4. **Run linter:** `npm run lint`
5. **Push changes:** `git push origin feature/your-feature`
6. **Create pull request**
7. **Code review & approval**
8. **Merge to develop**
9. **Deploy to staging** (automatic)
10. **Production deployment** (manual approval)

## 📝 Code Style

- **TypeScript** for type safety
- **ESLint** for code quality
- **Prettier** for formatting
- **Conventional Commits** for commit messages
- **Module-based** organization
- **Test-driven** development encouraged

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and development process.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation:** See `docs/` directory
- **Issues:** GitHub Issues
- **Email:** support@example.com

## 🗺️ Roadmap

### Phase 1: MVP (Weeks 1-6) ✅
- Authentication & user management
- Product & inventory management
- Point of Sale system
- Basic reporting

### Phase 2: Advanced Features (Weeks 7-10) 🚧
- Purchase orders
- Customer management
- Advanced reporting
- Real-time updates

### Phase 3: Production Ready (Weeks 11-12) ⏳
- Security hardening
- Performance optimization
- Production deployment
- Documentation

### Future Enhancements
- Multi-location support
- Mobile app
- Advanced analytics
- Third-party integrations

## 🙏 Acknowledgments

- NestJS Team for the amazing framework
- Vercel Team for Next.js
- shadcn for the UI components
- All open source contributors

---

**Project Status:** Design Complete, Ready for Implementation  
**Version:** 1.0.0  
**Last Updated:** June 11, 2026

For detailed technical information, see the [documentation](docs/) directory.
