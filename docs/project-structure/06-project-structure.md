# Project Structure and Organization

**Document Version:** 1.0  
**Date:** June 11, 2026  
**Prepared By:** Senior Software Architect  
**Project:** Vape Shop Inventory and Sales Management System

---

## Executive Summary

This document defines the complete project structure, folder organization, naming conventions, and code organization patterns for both frontend (Next.js) and backend (NestJS) applications. It follows industry best practices for maintainability, scalability, and developer experience.

**Architecture:** Monorepo with separate frontend/backend  
**Package Manager:** npm  
**Code Style:** Enforced via ESLint + Prettier  
**Type Safety:** TypeScript throughout

---

## Table of Contents

1. Repository Structure
2. Backend Structure (NestJS)
3. Frontend Structure (Next.js)
4. Shared Code and Types
5. Configuration Files
6. Naming Conventions
7. Code Organization Best Practices
8. Environment Management
9. Scripts and Automation

---

## 1. Repository Structure

### 1.1 Root Directory Structure

```
vape-shop-system/
├── .github/                      # GitHub workflows and templates
│   ├── workflows/
│   │   ├── ci.yml               # Continuous Integration
│   │   ├── cd-staging.yml       # Deploy to staging
│   │   └── cd-production.yml    # Deploy to production
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
│
├── backend/                      # NestJS backend application
│   ├── src/
│   ├── test/
│   ├── prisma/
│   ├── package.json
│   ├── tsconfig.json
│   └── nest-cli.json
│
├── frontend/                     # Next.js frontend application
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   └── next.config.js
│
├── infrastructure/               # Infrastructure as Code
│   ├── docker/
│   │   ├── Dockerfile.backend
│   │   ├── Dockerfile.frontend
│   │   └── Dockerfile.nginx
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   ├── nginx/
│   │   └── nginx.conf
│   └── scripts/
│
├── docs/                         # Documentation
│   ├── requirements/
│   ├── architecture/
│   ├── database/
│   ├── api/
│   ├── security/
│   ├── project-structure/
│   └── deployment/
│
├── scripts/                      # Utility scripts
│   ├── setup.sh
│   ├── backup-db.sh
│   ├── restore-db.sh
│   └── seed-data.sh
│
├── .gitignore
├── .env.example
├── README.md
├── LICENSE
└── package.json                  # Root package.json (workspace)
```

### 1.2 Workspace Configuration

**Root package.json:**
```json
{
  "name": "vape-shop-system",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "frontend",
    "backend"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run start:dev",
    "dev:frontend": "cd frontend && npm run dev",
    "build": "npm run build:backend && npm run build:frontend",
    "build:backend": "cd backend && npm run build",
    "build:frontend": "cd frontend && npm run build",
    "test": "npm run test:backend && npm run test:frontend",
    "test:backend": "cd backend && npm run test",
    "test:frontend": "cd frontend && npm run test",
    "lint": "npm run lint:backend && npm run lint:frontend",
    "lint:backend": "cd backend && npm run lint",
    "lint:frontend": "cd frontend && npm run lint",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down"
  },
  "devDependencies": {
    "concurrently": "^8.2.0",
    "prettier": "^3.0.0"
  }
}
```

---

## 2. Backend Structure (NestJS)

### 2.1 Complete Backend Directory Structure



```
backend/
├── src/
│   ├── main.ts                           # Application entry point
│   ├── app.module.ts                     # Root module
│   ├── app.controller.ts                 # Root controller (health check)
│   ├── app.service.ts                    # Root service
│   │
│   ├── config/                           # Configuration
│   │   ├── database.config.ts
│   │   ├── jwt.config.ts
│   │   ├── redis.config.ts
│   │   ├── cors.config.ts
│   │   ├── rate-limit.config.ts
│   │   └── swagger.config.ts
│   │
│   ├── common/                           # Shared code
│   │   ├── constants/
│   │   │   ├── roles.constant.ts
│   │   │   ├── permissions.constant.ts
│   │   │   └── error-codes.constant.ts
│   │   ├── decorators/
│   │   │   ├── roles.decorator.ts
│   │   │   ├── permissions.decorator.ts
│   │   │   ├── current-user.decorator.ts
│   │   │   └── public.decorator.ts
│   │   ├── filters/
│   │   │   ├── http-exception.filter.ts
│   │   │   ├── prisma-exception.filter.ts
│   │   │   └── all-exceptions.filter.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── roles.guard.ts
│   │   │   ├── permissions.guard.ts
│   │   │   └── throttle.guard.ts
│   │   ├── interceptors/
│   │   │   ├── logging.interceptor.ts
│   │   │   ├── transform.interceptor.ts
│   │   │   ├── timeout.interceptor.ts
│   │   │   └── cache.interceptor.ts
│   │   ├── pipes/
│   │   │   ├── validation.pipe.ts
│   │   │   └── parse-uuid.pipe.ts
│   │   ├── middleware/
│   │   │   ├── logger.middleware.ts
│   │   │   ├── request-id.middleware.ts
│   │   │   └── helmet.middleware.ts
│   │   ├── interfaces/
│   │   │   ├── api-response.interface.ts
│   │   │   ├── pagination.interface.ts
│   │   │   └── request-user.interface.ts
│   │   ├── dto/
│   │   │   ├── pagination.dto.ts
│   │   │   └── response.dto.ts
│   │   └── utils/
│   │       ├── hash.util.ts
│   │       ├── date.util.ts
│   │       └── string.util.ts
│   │
│   ├── modules/
│   │   │
│   │   ├── auth/                         # Authentication module
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.controller.spec.ts
│   │   │   ├── auth.service.spec.ts
│   │   │   ├── strategies/
│   │   │   │   ├── jwt.strategy.ts
│   │   │   │   ├── jwt-refresh.strategy.ts
│   │   │   │   └── local.strategy.ts
│   │   │   ├── guards/
│   │   │   │   ├── local-auth.guard.ts
│   │   │   │   └── jwt-refresh.guard.ts
│   │   │   ├── dto/
│   │   │   │   ├── login.dto.ts
│   │   │   │   ├── register.dto.ts
│   │   │   │   ├── change-password.dto.ts
│   │   │   │   └── refresh-token.dto.ts
│   │   │   └── interfaces/
│   │   │       ├── jwt-payload.interface.ts
│   │   │       └── auth-response.interface.ts
│   │   │
│   │   ├── users/                        # User management module
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── users.controller.spec.ts
│   │   │   ├── users.service.spec.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-user.dto.ts
│   │   │   │   ├── update-user.dto.ts
│   │   │   │   └── query-user.dto.ts
│   │   │   └── entities/
│   │   │       └── user.entity.ts
│   │   │
│   │   ├── products/                     # Product management module
│   │   │   ├── products.module.ts
│   │   │   ├── products.controller.ts
│   │   │   ├── products.service.ts
│   │   │   ├── products.controller.spec.ts
│   │   │   ├── products.service.spec.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-product.dto.ts
│   │   │   │   ├── update-product.dto.ts
│   │   │   │   ├── query-product.dto.ts
│   │   │   │   ├── create-variant.dto.ts
│   │   │   │   └── update-variant.dto.ts
│   │   │   └── entities/
│   │   │       ├── product.entity.ts
│   │   │       └── product-variant.entity.ts
│   │   │
│   │   ├── inventory/                    # Inventory management module
│   │   │   ├── inventory.module.ts
│   │   │   ├── inventory.controller.ts
│   │   │   ├── inventory.service.ts
│   │   │   ├── inventory.controller.spec.ts
│   │   │   ├── inventory.service.spec.ts
│   │   │   ├── dto/
│   │   │   │   ├── adjust-inventory.dto.ts
│   │   │   │   ├── receive-inventory.dto.ts
│   │   │   │   └── query-inventory.dto.ts
│   │   │   └── entities/
│   │   │       ├── inventory.entity.ts
│   │   │       └── inventory-log.entity.ts
│   │   │
│   │   ├── sales/                        # Sales management module
│   │   │   ├── sales.module.ts
│   │   │   ├── sales.controller.ts
│   │   │   ├── sales.service.ts
│   │   │   ├── sales.controller.spec.ts
│   │   │   ├── sales.service.spec.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-sale.dto.ts
│   │   │   │   ├── void-sale.dto.ts
│   │   │   │   └── query-sale.dto.ts
│   │   │   └── entities/
│   │   │       ├── sale.entity.ts
│   │   │       └── sale-item.entity.ts
│   │   │
│   │   ├── reports/                      # Reporting module
│   │   │   ├── reports.module.ts
│   │   │   ├── reports.controller.ts
│   │   │   ├── reports.service.ts
│   │   │   ├── reports.controller.spec.ts
│   │   │   ├── reports.service.spec.ts
│   │   │   ├── dto/
│   │   │   │   ├── dashboard-query.dto.ts
│   │   │   │   ├── sales-report-query.dto.ts
│   │   │   │   └── inventory-report-query.dto.ts
│   │   │   └── interfaces/
│   │   │       ├── dashboard-metrics.interface.ts
│   │   │       └── sales-report.interface.ts
│   │   │
│   │   ├── purchase-orders/              # Purchase order module
│   │   │   ├── purchase-orders.module.ts
│   │   │   ├── purchase-orders.controller.ts
│   │   │   ├── purchase-orders.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-po.dto.ts
│   │   │   │   ├── update-po.dto.ts
│   │   │   │   └── receive-po.dto.ts
│   │   │   └── entities/
│   │   │       ├── purchase-order.entity.ts
│   │   │       └── purchase-order-item.entity.ts
│   │   │
│   │   ├── customers/                    # Customer management module
│   │   │   ├── customers.module.ts
│   │   │   ├── customers.controller.ts
│   │   │   ├── customers.service.ts
│   │   │   ├── dto/
│   │   │   └── entities/
│   │   │
│   │   ├── shifts/                       # Shift management module
│   │   │   ├── shifts.module.ts
│   │   │   ├── shifts.controller.ts
│   │   │   ├── shifts.service.ts
│   │   │   ├── dto/
│   │   │   └── entities/
│   │   │
│   │   ├── categories/                   # Category management module
│   │   │   ├── categories.module.ts
│   │   │   ├── categories.controller.ts
│   │   │   ├── categories.service.ts
│   │   │   ├── dto/
│   │   │   └── entities/
│   │   │
│   │   ├── audit/                        # Audit logging module
│   │   │   ├── audit.module.ts
│   │   │   ├── audit.service.ts
│   │   │   ├── audit.controller.ts
│   │   │   ├── dto/
│   │   │   └── entities/
│   │   │
│   │   ├── notifications/                # Notification module
│   │   │   ├── notifications.module.ts
│   │   │   ├── notifications.controller.ts
│   │   │   ├── notifications.service.ts
│   │   │   ├── notifications.gateway.ts  # WebSocket
│   │   │   ├── dto/
│   │   │   └── entities/
│   │   │
│   │   └── websocket/                    # WebSocket module
│   │       ├── websocket.module.ts
│   │       ├── websocket.gateway.ts
│   │       ├── websocket.service.ts
│   │       └── dto/
│   │
│   ├── prisma/                           # Prisma integration
│   │   ├── prisma.module.ts
│   │   ├── prisma.service.ts
│   │   └── prisma.service.spec.ts
│   │
│   └── database/                         # Database utilities
│       ├── seeds/
│       │   ├── seed.ts
│       │   ├── roles.seed.ts
│       │   ├── users.seed.ts
│       │   ├── categories.seed.ts
│       │   ├── payment-methods.seed.ts
│       │   └── settings.seed.ts
│       └── factories/
│           ├── user.factory.ts
│           ├── product.factory.ts
│           └── sale.factory.ts
│
├── test/                                 # E2E tests
│   ├── app.e2e-spec.ts
│   ├── auth.e2e-spec.ts
│   ├── users.e2e-spec.ts
│   ├── products.e2e-spec.ts
│   ├── inventory.e2e-spec.ts
│   └── sales.e2e-spec.ts
│
├── prisma/                               # Prisma schema
│   ├── schema.prisma
│   └── migrations/
│
├── dist/                                 # Build output (gitignored)
├── node_modules/                         # Dependencies (gitignored)
│
├── .env                                  # Environment variables (gitignored)
├── .env.example                          # Environment template
├── .eslintrc.js                          # ESLint configuration
├── .prettierrc                           # Prettier configuration
├── nest-cli.json                         # NestJS CLI configuration
├── package.json                          # Dependencies and scripts
├── tsconfig.json                         # TypeScript configuration
├── tsconfig.build.json                   # Build TypeScript config
└── README.md                             # Backend documentation
```

### 2.2 Backend Module Structure Pattern

**Standard Module Pattern:**
```
module-name/
├── module-name.module.ts         # Module definition
├── module-name.controller.ts     # HTTP endpoints
├── module-name.service.ts        # Business logic
├── module-name.controller.spec.ts # Controller tests
├── module-name.service.spec.ts   # Service tests
├── dto/                          # Data Transfer Objects
│   ├── create-entity.dto.ts
│   ├── update-entity.dto.ts
│   └── query-entity.dto.ts
├── entities/                     # Domain entities
│   └── entity.entity.ts
├── interfaces/                   # TypeScript interfaces
│   └── entity.interface.ts
└── guards/                       # Module-specific guards (optional)
    └── entity.guard.ts
```

---

## 3. Frontend Structure (Next.js)

### 3.1 Complete Frontend Directory Structure



```
frontend/
├── app/                                  # Next.js 14 App Router
│   ├── (auth)/                          # Auth route group
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── forgot-password/
│   │   │   └── page.tsx
│   │   └── layout.tsx                   # Auth layout
│   │
│   ├── (dashboard)/                     # Protected dashboard group
│   │   ├── dashboard/                   # Main dashboard
│   │   │   ├── page.tsx
│   │   │   └── loading.tsx
│   │   ├── products/                    # Products management
│   │   │   ├── page.tsx
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx
│   │   │   │   └── edit/
│   │   │   │       └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   ├── inventory/                   # Inventory management
│   │   │   ├── page.tsx
│   │   │   ├── adjust/
│   │   │   │   └── page.tsx
│   │   │   └── receive/
│   │   │       └── page.tsx
│   │   ├── sales/                       # Sales management
│   │   │   ├── page.tsx
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   ├── reports/                     # Reports
│   │   │   ├── page.tsx
│   │   │   ├── sales/
│   │   │   │   └── page.tsx
│   │   │   ├── inventory/
│   │   │   │   └── page.tsx
│   │   │   └── staff/
│   │   │       └── page.tsx
│   │   ├── purchase-orders/             # Purchase orders
│   │   │   ├── page.tsx
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   ├── customers/                   # Customer management
│   │   │   ├── page.tsx
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   ├── users/                       # User management
│   │   │   ├── page.tsx
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   ├── settings/                    # Settings
│   │   │   ├── page.tsx
│   │   │   ├── profile/
│   │   │   │   └── page.tsx
│   │   │   ├── system/
│   │   │   │   └── page.tsx
│   │   │   └── security/
│   │   │       └── page.tsx
│   │   └── layout.tsx                   # Dashboard layout
│   │
│   ├── api/                             # API routes (if needed)
│   │   └── health/
│   │       └── route.ts
│   │
│   ├── layout.tsx                       # Root layout
│   ├── page.tsx                         # Home page (redirects)
│   ├── loading.tsx                      # Global loading
│   ├── error.tsx                        # Global error
│   └── not-found.tsx                    # 404 page
│
├── components/                          # React components
│   ├── ui/                              # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── dialog.tsx
│   │   ├── table.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── toast.tsx
│   │   └── ...
│   │
│   ├── forms/                           # Reusable form components
│   │   ├── product-form.tsx
│   │   ├── sale-form.tsx
│   │   ├── user-form.tsx
│   │   ├── inventory-adjust-form.tsx
│   │   └── customer-form.tsx
│   │
│   ├── tables/                          # Reusable table components
│   │   ├── products-table.tsx
│   │   ├── sales-table.tsx
│   │   ├── inventory-table.tsx
│   │   └── users-table.tsx
│   │
│   ├── layouts/                         # Layout components
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   ├── footer.tsx
│   │   └── mobile-nav.tsx
│   │
│   ├── dashboard/                       # Dashboard-specific components
│   │   ├── sales-chart.tsx
│   │   ├── revenue-card.tsx
│   │   ├── low-stock-alert.tsx
│   │   ├── recent-sales.tsx
│   │   └── quick-actions.tsx
│   │
│   ├── shared/                          # Shared components
│   │   ├── loading-spinner.tsx
│   │   ├── error-boundary.tsx
│   │   ├── pagination.tsx
│   │   ├── search-input.tsx
│   │   ├── date-picker.tsx
│   │   └── confirmation-dialog.tsx
│   │
│   └── providers/                       # Context providers
│       ├── auth-provider.tsx
│       ├── theme-provider.tsx
│       ├── toast-provider.tsx
│       └── query-provider.tsx
│
├── lib/                                 # Library code
│   ├── api/                             # API client
│   │   ├── client.ts                   # Axios/Fetch client
│   │   ├── auth.api.ts
│   │   ├── users.api.ts
│   │   ├── products.api.ts
│   │   ├── inventory.api.ts
│   │   ├── sales.api.ts
│   │   ├── reports.api.ts
│   │   └── index.ts
│   │
│   ├── hooks/                           # Custom React hooks
│   │   ├── use-auth.ts
│   │   ├── use-products.ts
│   │   ├── use-sales.ts
│   │   ├── use-inventory.ts
│   │   ├── use-debounce.ts
│   │   ├── use-local-storage.ts
│   │   └── use-websocket.ts
│   │
│   ├── validations/                     # Zod schemas
│   │   ├── auth.schema.ts
│   │   ├── user.schema.ts
│   │   ├── product.schema.ts
│   │   ├── sale.schema.ts
│   │   └── inventory.schema.ts
│   │
│   ├── utils/                           # Utility functions
│   │   ├── format.ts                   # Formatting utilities
│   │   ├── date.ts                     # Date utilities
│   │   ├── currency.ts                 # Currency formatting
│   │   ├── validation.ts               # Validation helpers
│   │   └── api-error.ts                # API error handling
│   │
│   └── constants/                       # Constants
│       ├── routes.ts
│       ├── permissions.ts
│       ├── roles.ts
│       └── status.ts
│
├── store/                               # Zustand stores
│   ├── auth.store.ts
│   ├── user.store.ts
│   ├── notification.store.ts
│   ├── cart.store.ts                   # For sale creation
│   └── ui.store.ts
│
├── types/                               # TypeScript types
│   ├── api.types.ts
│   ├── auth.types.ts
│   ├── user.types.ts
│   ├── product.types.ts
│   ├── sale.types.ts
│   ├── inventory.types.ts
│   └── index.ts
│
├── styles/                              # Global styles
│   └── globals.css
│
├── public/                              # Static assets
│   ├── images/
│   │   ├── logo.svg
│   │   └── placeholder.png
│   ├── fonts/
│   └── icons/
│
├── __tests__/                           # Tests
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   └── pages/
│
├── .next/                               # Next.js build (gitignored)
├── node_modules/                        # Dependencies (gitignored)
│
├── .env.local                           # Local environment (gitignored)
├── .env.example                         # Environment template
├── .eslintrc.json                       # ESLint configuration
├── .prettierrc                          # Prettier configuration
├── next.config.js                       # Next.js configuration
├── tailwind.config.ts                   # Tailwind configuration
├── tsconfig.json                        # TypeScript configuration
├── components.json                      # shadcn/ui configuration
├── package.json                         # Dependencies and scripts
└── README.md                            # Frontend documentation
```

### 3.2 Frontend Component Organization

**Component Naming Pattern:**
```tsx
// PascalCase for component files
ProductCard.tsx
SalesTable.tsx
DashboardHeader.tsx

// Component structure
export function ProductCard({ product }: ProductCardProps) {
  return (
    <Card>
      {/* Component content */}
    </Card>
  );
}

// Export types
export type ProductCardProps = {
  product: Product;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
};
```

---

## 4. Shared Code and Types

### 4.1 Shared Types Package (Optional Future)

For larger projects, shared types can be extracted:

```
shared/
├── types/
│   ├── user.types.ts
│   ├── product.types.ts
│   └── index.ts
└── package.json
```

Then imported in both frontend and backend:
```typescript
import { User, Product } from '@vape-shop/shared';
```

### 4.2 Type Synchronization

**Generate Frontend Types from Backend:**

```bash
# In backend, generate Prisma types
npx prisma generate

# Copy types to frontend (automated in build)
cp backend/node_modules/.prisma/client/index.d.ts frontend/types/prisma.d.ts
```

---

## 5. Configuration Files

### 5.1 Backend Configuration Files

**nest-cli.json:**
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "assets": ["**/*.proto"],
    "watchAssets": true
  }
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["src/*"],
      "@config/*": ["src/config/*"],
      "@common/*": ["src/common/*"],
      "@modules/*": ["src/modules/*"]
    }
  }
}
```

**package.json:**
```json
{
  "name": "vape-shop-backend",
  "version": "1.0.0",
  "scripts": {
    "prebuild": "rimraf dist",
    "build": "nest build",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:studio": "prisma studio",
    "prisma:seed": "ts-node prisma/seed.ts"
  }
}
```

### 5.2 Frontend Configuration Files

**next.config.js:**
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['cdn.example.com'],
    formats: ['image/avif', 'image/webp'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"],
      "@/components/*": ["./components/*"],
      "@/lib/*": ["./lib/*"],
      "@/types/*": ["./types/*"],
      "@/store/*": ["./store/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**tailwind.config.ts:**
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // ... more colors
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

---

## 6. Naming Conventions

### 6.1 File Naming

**Backend:**
- Modules: `kebab-case` - `user-management.module.ts`
- Controllers: `kebab-case` - `user-management.controller.ts`
- Services: `kebab-case` - `user-management.service.ts`
- DTOs: `kebab-case` - `create-user.dto.ts`
- Interfaces: `kebab-case` - `user-response.interface.ts`
- Constants: `kebab-case` - `error-codes.constant.ts`

**Frontend:**
- Components: `PascalCase` - `ProductCard.tsx`
- Pages: `page.tsx` (Next.js convention)
- Hooks: `kebab-case` - `use-products.ts`
- Utils: `kebab-case` - `format-currency.ts`
- Types: `kebab-case` - `product.types.ts`
- Stores: `kebab-case` - `auth.store.ts`

### 6.2 Code Naming

**Variables and Functions:**
```typescript
// camelCase for variables and functions
const userName = 'John';
const totalPrice = 100.50;

function calculateTotal(items: Item[]): number {
  // ...
}

// PascalCase for classes and types
class UserService {}
interface UserData {}
type ProductVariant = {};

// UPPER_SNAKE_CASE for constants
const MAX_LOGIN_ATTEMPTS = 5;
const DEFAULT_PAGE_SIZE = 20;
```

**Component Naming:**
```tsx
// Component names: PascalCase, descriptive
export function ProductListTable() {}
export function SaleCreateForm() {}
export function DashboardMetricsCard() {}

// Props type: ComponentNameProps
export type ProductListTableProps = {
  products: Product[];
  onSelect: (id: string) => void;
};
```

**API Endpoints:**
```typescript
// RESTful, plural nouns, kebab-case
GET    /api/v1/products
POST   /api/v1/products
GET    /api/v1/products/:id
PATCH  /api/v1/products/:id
DELETE /api/v1/products/:id

GET    /api/v1/purchase-orders
POST   /api/v1/inventory/adjust
```

---

## 7. Code Organization Best Practices

### 7.1 Import Organization

**Standard Import Order:**
```typescript
// 1. External libraries
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// 2. Internal absolute imports (using aliases)
import { UserDto } from '@/modules/users/dto/user.dto';
import { RolesGuard } from '@/common/guards/roles.guard';

// 3. Relative imports
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

// 4. Types and interfaces
import type { User } from '@prisma/client';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
```

### 7.2 Barrel Exports

**Module index.ts:**
```typescript
// modules/users/index.ts
export * from './users.module';
export * from './users.service';
export * from './dto';
export * from './entities';
```

**Usage:**
```typescript
// Instead of multiple imports
import { UsersModule, UsersService, CreateUserDto } from '@/modules/users';
```

### 7.3 Error Handling Patterns

**Backend:**
```typescript
// Custom exceptions
throw new NotFoundException(`Product with ID ${id} not found`);
throw new BadRequestException('Invalid product data');
throw new UnauthorizedException('Invalid credentials');

// Use exception filters for consistent responses
```

**Frontend:**
```typescript
// API error handling
try {
  const product = await api.products.getById(id);
} catch (error) {
  if (error.response?.status === 404) {
    toast.error('Product not found');
  } else {
    toast.error('An error occurred');
  }
}
```

---

## 8. Environment Management

### 8.1 Backend Environment Variables

**.env.example:**
```env
# Application
NODE_ENV=development
PORT=4000
API_PREFIX=api/v1

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/vape_shop_db"

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRATION=15m
JWT_REFRESH_SECRET=your-super-secret-refresh-key
JWT_REFRESH_EXPIRATION=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# CORS
CORS_ORIGIN=http://localhost:3000

# Rate Limiting
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100

# Email (SendGrid)
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@vapeshop.com

# AWS (for backups)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=vape-shop-backups

# Monitoring
SENTRY_DSN=
```

### 8.2 Frontend Environment Variables

**.env.example:**
```env
# API
NEXT_PUBLIC_API_URL=http://localhost:4000

# App
NEXT_PUBLIC_APP_NAME=Vape Shop Management
NEXT_PUBLIC_APP_VERSION=1.0.0

# Features
NEXT_PUBLIC_ENABLE_ANALYTICS=false

# Analytics (if enabled)
NEXT_PUBLIC_GA_MEASUREMENT_ID=
```

---

## 9. Scripts and Automation

### 9.1 Development Scripts

**Backend package.json scripts:**
```json
{
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "lint": "eslint \"{src,test}/**/*.ts\" --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:seed": "ts-node database/seeds/seed.ts",
    "db:studio": "prisma studio",
    "db:reset": "prisma migrate reset && npm run db:seed"
  }
}
```

**Frontend package.json scripts:**
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "analyze": "ANALYZE=true next build"
  }
}
```

### 9.2 Utility Scripts

**scripts/setup.sh:**
```bash
#!/bin/bash
# Setup development environment

echo "Setting up Vape Shop Management System..."

# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# Install dependencies
echo "Installing backend dependencies..."
cd backend && npm install

echo "Installing frontend dependencies..."
cd ../frontend && npm install

# Setup database
echo "Setting up database..."
cd ../backend
npx prisma generate
npx prisma migrate dev
npm run db:seed

echo "Setup complete! Run 'npm run dev' to start development."
```

---

## 10. Conclusion

### 10.1 Summary

✅ **Clear Structure:** Organized by feature/module for scalability  
✅ **Separation of Concerns:** Business logic, presentation, data access separated  
✅ **Type Safety:** TypeScript throughout with shared types  
✅ **Testing:** Test files co-located with source code  
✅ **Configuration:** Centralized configuration management  
✅ **Conventions:** Consistent naming and code organization  
✅ **Tooling:** ESLint, Prettier, Husky for code quality  

### 10.2 Next Steps

1. ✅ Requirements Analysis Complete
2. ✅ System Architecture Complete
3. ✅ Database Schema Complete
4. ✅ API Design Complete
5. ✅ Security Architecture Complete
6. ✅ **Project Structure Complete**
7. ➡️ **Next: Implementation Roadmap**
   - Phased development plan
   - Sprint planning
   - Task breakdown
   - Timeline estimation
   
8. ➡️ Documentation Consolidation
9. ➡️ Implementation

---

**Document Status:** Complete  
**Review Status:** Ready for Team Review  
**Next Document:** Implementation Roadmap

---

*This project structure follows industry best practices for enterprise applications and provides a solid foundation for building, testing, and maintaining the vape shop management system.*
