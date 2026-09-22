# System Architecture Design

**Document Version:** 1.0  
**Date:** June 11, 2026  
**Prepared By:** Senior System Architect  
**Project:** Vape Shop Inventory and Sales Management System

---

## Executive Summary

This document defines the complete system architecture for a production-ready vape shop management system. It covers the high-level architecture, technology stack decisions, component interactions, data flow, security architecture, deployment strategy, and scalability considerations.

**Architecture Type:** Three-tier monolithic with microservice-ready design  
**Deployment Model:** Containerized single-server with horizontal scaling capability  
**Architecture Style:** RESTful API with real-time WebSocket layer

---

## Table of Contents

1. High-Level Architecture
2. Technology Stack Justification
3. Component Architecture
4. Data Flow Architecture
5. Security Architecture
6. Infrastructure Architecture
7. Scalability and Performance
8. Monitoring and Observability
9. Disaster Recovery Architecture
10. Development and Deployment Pipeline

---

## 1. High-Level Architecture

### 1.1 Architecture Diagram


```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Desktop    │  │    Tablet    │  │    Mobile    │              │
│  │   Browser    │  │   Browser    │  │   Browser    │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
│         └──────────────────┼──────────────────┘                      │
│                            │                                          │
└────────────────────────────┼──────────────────────────────────────────┘
                             │
                             │ HTTPS (TLS 1.3)
                             │
┌────────────────────────────┼──────────────────────────────────────────┐
│                   EDGE/PROXY LAYER                                    │
├────────────────────────────┼──────────────────────────────────────────┤
│                            │                                           │
│                    ┌───────▼────────┐                                 │
│                    │   Cloudflare   │                                 │
│                    │   (CDN/WAF)    │                                 │
│                    └───────┬────────┘                                 │
│                            │                                           │
│                    ┌───────▼────────┐                                 │
│                    │     Nginx      │                                 │
│                    │ Reverse Proxy  │                                 │
│                    │ Load Balancer  │                                 │
│                    │  SSL Termination│                                │
│                    └───────┬────────┘                                 │
│                            │                                           │
└────────────────────────────┼──────────────────────────────────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │

┌───────────────┼────────────────────────────────┼───────────────────┐
│               │     APPLICATION LAYER          │                   │
├───────────────┼────────────────────────────────┼───────────────────┤
│               │                                 │                   │
│       ┌───────▼────────┐              ┌────────▼────────┐          │
│       │   Next.js App  │              │   NestJS API    │          │
│       │   (Frontend)   │              │   (Backend)     │          │
│       ├────────────────┤              ├─────────────────┤          │
│       │ • React 18     │◄────HTTP────►│ • REST API      │          │
│       │ • TypeScript   │              │ • WebSocket     │          │
│       │ • Tailwind CSS │              │ • Auth Service  │          │
│       │ • shadcn/ui    │              │ • Business Logic│          │
│       │ • React Query  │              │ • Validation    │          │
│       │ • Zustand      │              │ • TypeScript    │          │
│       └────────────────┘              └─────────┬───────┘          │
│                                                  │                   │
└──────────────────────────────────────────────────┼───────────────────┘
                                                   │
┌──────────────────────────────────────────────────┼───────────────────┐
│                    DATA LAYER                    │                   │
├──────────────────────────────────────────────────┼───────────────────┤
│                                                  │                   │
│  ┌──────────────┐        ┌──────────────┐  ┌───▼────────┐          │
│  │    Redis     │◄───────┤  Prisma ORM  │◄─┤ PostgreSQL │          │
│  │  (Cache +    │        │  (Type-safe) │  │  Database  │          │
│  │   Session +  │        └──────────────┘  └────────────┘          │
│  │   WebSocket) │                                                    │
│  └──────────────┘                                                    │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES LAYER                            │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   Email      │  │   SMS/Alerts │  │   Payment    │               │
│  │   Service    │  │   (Twilio)   │  │   Gateway    │               │
│  │  (SendGrid)  │  │              │  │  (Stripe)    │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│                   MONITORING & LOGGING LAYER                          │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   Winston    │  │   Prometheus │  │   Grafana    │               │
│  │   Logger     │  │   Metrics    │  │   Dashboard  │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Architecture Principles

1. **Separation of Concerns:** Clear boundaries between presentation, business logic, and data layers
2. **Single Responsibility:** Each component has one well-defined purpose
3. **DRY (Don't Repeat Yourself):** Shared logic in reusable modules
4. **SOLID Principles:** Applied throughout backend architecture
5. **Security by Design:** Security considerations at every layer
6. **Fail-Safe Defaults:** Secure by default, explicitly grant permissions
7. **Defense in Depth:** Multiple layers of security controls
8. **Stateless API:** RESTful API design for scalability
9. **Idempotency:** Critical operations can be safely retried
10. **Observable System:** Comprehensive logging and monitoring



---

## 2. Technology Stack Justification

### 2.1 Frontend Stack

| Technology | Version | Justification |
|------------|---------|---------------|
| **Next.js** | 14.x | • Server-side rendering for better SEO and performance<br>• Built-in routing and API routes<br>• Excellent TypeScript support<br>• Image optimization<br>• Production-ready with minimal configuration |
| **React** | 18.x | • Component-based architecture<br>• Large ecosystem and community<br>• Excellent for real-time UI updates<br>• Virtual DOM for performance |
| **TypeScript** | 5.x | • Type safety reduces runtime errors<br>• Better IDE support and autocomplete<br>• Self-documenting code<br>• Easier refactoring |
| **Tailwind CSS** | 3.x | • Utility-first CSS for rapid development<br>• Consistent design system<br>• Small production bundle with tree-shaking<br>• Responsive design made easy |
| **shadcn/ui** | Latest | • High-quality, accessible components<br>• Customizable and not a dependency<br>• Built on Radix UI primitives<br>• Consistent with modern design practices |
| **React Hook Form** | 7.x | • Performant form handling<br>• Built-in validation<br>• Excellent TypeScript support<br>• Minimal re-renders |
| **Zod** | 3.x | • Runtime type validation<br>• Schema-based validation<br>• Excellent TypeScript inference<br>• Composable validators |
| **React Query** | 5.x | • Powerful data fetching and caching<br>• Automatic refetching<br>• Optimistic updates<br>• Request deduplication |
| **Zustand** | 4.x | • Lightweight state management<br>• Simple API<br>• No boilerplate<br>• DevTools support |


### 2.2 Backend Stack

| Technology | Version | Justification |
|------------|---------|---------------|
| **NestJS** | 10.x | • Enterprise-grade Node.js framework<br>• Built-in dependency injection<br>• Modular architecture<br>• Excellent TypeScript support<br>• Built-in support for WebSockets, guards, interceptors<br>• Testing utilities included |
| **Node.js** | 20.x LTS | • JavaScript runtime for backend<br>• Large ecosystem (npm)<br>• Excellent for real-time applications<br>• Same language as frontend |
| **TypeScript** | 5.x | • Type safety on backend<br>• Shared types with frontend<br>• Better refactoring support |
| **Prisma** | 5.x | • Type-safe database client<br>• Automatic migrations<br>• Excellent developer experience<br>• Query optimization<br>• Database introspection |
| **PostgreSQL** | 15.x | • ACID compliant relational database<br>• Excellent for complex queries<br>• JSON support for flexibility<br>• Robust and battle-tested<br>• Strong consistency guarantees |
| **Redis** | 7.x | • In-memory data store for caching<br>• Session management<br>• WebSocket pub/sub<br>• Rate limiting<br>• Job queuing |
| **Passport.js** | 0.7.x | • Authentication middleware<br>• Multiple strategies support<br>• Well-maintained<br>• Easy integration with NestJS |
| **JWT** | 9.x | • Stateless authentication<br>• Scalable across servers<br>• Industry standard |
| **bcrypt** | 5.x | • Secure password hashing<br>• Adaptive hashing (configurable rounds)<br>• Industry standard |


### 2.3 Infrastructure Stack

| Technology | Version | Justification |
|------------|---------|---------------|
| **Docker** | 24.x | • Container runtime<br>• Consistent environments<br>• Easy deployment<br>• Resource isolation |
| **Docker Compose** | 2.x | • Multi-container orchestration<br>• Development environment<br>• Simple deployment for single server |
| **Nginx** | 1.25.x | • Reverse proxy<br>• Load balancing capability<br>• SSL termination<br>• Static file serving<br>• Rate limiting |
| **Ubuntu Server** | 22.04 LTS | • Stable and well-supported<br>• Long-term support<br>• Large community<br>• Enterprise-ready |
| **Cloudflare** | N/A | • CDN for static assets<br>• DDoS protection<br>• Web Application Firewall<br>• SSL/TLS management<br>• DNS management |

### 2.4 Development and Operations

| Technology | Purpose | Justification |
|------------|---------|---------------|
| **Git** | Version control | Industry standard |
| **GitHub Actions** | CI/CD | Integrated with repository, free for private repos |
| **Jest** | Testing framework | Excellent for TypeScript, snapshot testing |
| **Supertest** | API testing | Integration testing for REST APIs |
| **ESLint** | Linting | Code quality and consistency |
| **Prettier** | Code formatting | Consistent code style |
| **Husky** | Git hooks | Pre-commit checks |
| **Winston** | Logging | Structured logging, multiple transports |
| **Prometheus** | Metrics collection | Industry standard for metrics |
| **Grafana** | Monitoring dashboards | Visualization and alerting |

---

## 3. Component Architecture

### 3.1 Frontend Architecture



```
frontend/
├── app/                          # Next.js 14 App Router
│   ├── (auth)/                   # Auth group routes
│   │   ├── login/
│   │   └── layout.tsx
│   ├── (dashboard)/              # Protected dashboard routes
│   │   ├── dashboard/            # Main dashboard
│   │   ├── products/             # Product management
│   │   ├── inventory/            # Inventory management
│   │   ├── sales/                # Sales management
│   │   ├── reports/              # Reports
│   │   ├── users/                # User management
│   │   ├── settings/             # System settings
│   │   └── layout.tsx            # Dashboard layout with nav
│   └── api/                      # API routes (if needed)
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── forms/                    # Reusable form components
│   ├── layouts/                  # Layout components
│   ├── dashboard/                # Dashboard-specific components
│   └── shared/                   # Shared components
├── lib/
│   ├── api/                      # API client functions
│   ├── hooks/                    # Custom React hooks
│   ├── utils/                    # Utility functions
│   ├── validations/              # Zod schemas
│   └── constants/                # Constants and enums
├── store/                        # Zustand stores
│   ├── auth.store.ts
│   ├── user.store.ts
│   └── notification.store.ts
├── types/                        # TypeScript types
│   ├── api.types.ts
│   ├── models.types.ts
│   └── index.ts
└── public/                       # Static assets
    ├── images/
    └── fonts/
```

#### 3.1.1 Frontend Layer Responsibilities

**Presentation Layer (Components)**
- UI rendering
- User interaction handling
- Form validation (client-side)
- Responsive design
- Accessibility

**State Management Layer (Zustand)**
- Authentication state
- User preferences
- UI state (modals, notifications)
- Cached data (complementing React Query)

**Data Layer (React Query)**
- API communication
- Data caching
- Request deduplication
- Optimistic updates
- Background refetching



### 3.2 Backend Architecture

```
backend/
├── src/
│   ├── main.ts                   # Application entry point
│   ├── app.module.ts             # Root module
│   ├── config/                   # Configuration
│   │   ├── database.config.ts
│   │   ├── jwt.config.ts
│   │   ├── redis.config.ts
│   │   └── validation.config.ts
│   ├── common/                   # Shared code
│   │   ├── decorators/           # Custom decorators
│   │   ├── filters/              # Exception filters
│   │   ├── guards/               # Auth guards
│   │   ├── interceptors/         # Request/response interceptors
│   │   ├── pipes/                # Validation pipes
│   │   ├── middleware/           # Custom middleware
│   │   └── utils/                # Utility functions
│   ├── modules/
│   │   ├── auth/                 # Authentication module
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.module.ts
│   │   │   ├── strategies/       # Passport strategies
│   │   │   ├── guards/           # Auth guards
│   │   │   └── dto/              # Data transfer objects
│   │   ├── users/                # User management
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── users.module.ts
│   │   │   └── dto/
│   │   ├── products/             # Product management
│   │   ├── inventory/            # Inventory management
│   │   ├── sales/                # Sales management
│   │   ├── reports/              # Reporting
│   │   ├── audit/                # Audit logging
│   │   ├── notifications/        # Notification service
│   │   └── websocket/            # WebSocket gateway
│   ├── prisma/                   # Prisma client and config
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── test/                     # Test files
├── package.json
└── tsconfig.json
```

#### 3.2.1 Backend Module Architecture

Each module follows NestJS best practices:

```
module-name/
├── module-name.controller.ts     # HTTP endpoints
├── module-name.service.ts        # Business logic
├── module-name.module.ts         # Module definition
├── module-name.gateway.ts        # WebSocket (if needed)
├── dto/                          # Data Transfer Objects
│   ├── create-entity.dto.ts
│   ├── update-entity.dto.ts
│   └── query-entity.dto.ts
├── entities/                     # Domain entities (if needed)
│   └── entity.entity.ts
└── interfaces/                   # TypeScript interfaces
    └── entity.interface.ts
```



#### 3.2.2 Backend Layer Responsibilities

**Controller Layer**
- HTTP request handling
- Request validation
- Response formatting
- Route authorization
- API documentation (Swagger)

**Service Layer**
- Business logic
- Data validation
- Transaction management
- External service integration
- Event emission

**Data Access Layer (Prisma)**
- Database queries
- Relationship management
- Transaction handling
- Migration management

**Infrastructure Layer**
- Caching (Redis)
- WebSocket management
- Email sending
- File storage
- Logging
- Metrics collection

---

## 4. Data Flow Architecture

### 4.1 Authentication Flow

```
┌─────────┐                                                      ┌─────────┐
│ Client  │                                                      │ Backend │
└────┬────┘                                                      └────┬────┘
     │                                                                │
     │ 1. POST /auth/login {email, password}                         │
     ├──────────────────────────────────────────────────────────────►│
     │                                                                │
     │                                    2. Validate credentials     │
     │                                    3. Check account status    │
     │                                    4. Log audit event         │
     │                                    5. Generate JWT tokens     │
     │                                    6. Store session in Redis  │
     │                                                                │
     │ 7. Response {accessToken, user} + Set-Cookie (refreshToken)  │
     │◄──────────────────────────────────────────────────────────────┤
     │                                                                │
     │ 8. Store accessToken in memory                                │
     │ 9. Make authenticated requests with Bearer token              │
     ├──────────────────────────────────────────────────────────────►│
     │                                                                │
     │                                    10. Validate JWT            │
     │                                    11. Check permissions       │
     │                                    12. Process request         │
     │                                                                │
     │ 13. Response with data                                        │
     │◄──────────────────────────────────────────────────────────────┤
     │                                                                │
```



### 4.2 Sales Transaction Flow

```
┌──────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐
│Client│  │ Backend │  │ Service │  │ Database │  │ WebSocket│
└──┬───┘  └────┬────┘  └────┬────┘  └────┬─────┘  └────┬─────┘
   │           │            │            │             │
   │ 1. Create Sale         │            │             │
   ├──────────►│            │            │             │
   │           │            │            │             │
   │           │ 2. Validate Request     │             │
   │           ├───────────►│            │             │
   │           │            │            │             │
   │           │            │ 3. Start Transaction     │
   │           │            ├───────────►│             │
   │           │            │            │             │
   │           │            │ 4. Check Inventory       │
   │           │            ├───────────►│             │
   │           │            │◄───────────┤             │
   │           │            │            │             │
   │           │            │ 5. Create Sale Record    │
   │           │            ├───────────►│             │
   │           │            │◄───────────┤             │
   │           │            │            │             │
   │           │            │ 6. Create Sale Items     │
   │           │            ├───────────►│             │
   │           │            │◄───────────┤             │
   │           │            │            │             │
   │           │            │ 7. Update Inventory      │
   │           │            ├───────────►│             │
   │           │            │◄───────────┤             │
   │           │            │            │             │
   │           │            │ 8. Create Inventory Logs │
   │           │            ├───────────►│             │
   │           │            │◄───────────┤             │
   │           │            │            │             │
   │           │            │ 9. Create Audit Log      │
   │           │            ├───────────►│             │
   │           │            │◄───────────┤             │
   │           │            │            │             │
   │           │            │ 10. Commit Transaction   │
   │           │            ├───────────►│             │
   │           │            │◄───────────┤             │
   │           │            │            │             │
   │           │            │ 11. Emit WebSocket Event │
   │           │            ├────────────┼────────────►│
   │           │            │            │             │
   │           │            │            │ 12. Broadcast
   │           │            │            │    to all clients
   │           │            │            │             │
   │           │ 13. Return Response     │             │
   │           │◄───────────┤            │             │
   │           │            │            │             │
   │ 14. Sale Created       │            │             │
   │◄──────────┤            │            │             │
   │           │            │            │             │
   │ 15. Real-time Update (WebSocket)                  │
   │◄──────────────────────────────────────────────────┤
   │           │            │            │             │
```



### 4.3 Real-Time Update Flow

```
┌──────────┐         ┌──────────┐         ┌──────────┐         ┌──────────┐
│ Client A │         │ Client B │         │  Backend │         │  Redis   │
└────┬─────┘         └────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │                    │
     │ 1. WebSocket Connect                    │                    │
     ├────────────────────────────────────────►│                    │
     │                    │                    │                    │
     │                    │ 2. WebSocket Connect                    │
     │                    ├───────────────────►│                    │
     │                    │                    │                    │
     │                    │                    │ 3. Subscribe to    │
     │                    │                    │    Redis channels  │
     │                    │                    ├───────────────────►│
     │                    │                    │                    │
     │ 4. Perform Action (e.g., sale)          │                    │
     ├────────────────────────────────────────►│                    │
     │                    │                    │                    │
     │                    │                    │ 5. Process action  │
     │                    │                    │    Update DB       │
     │                    │                    │                    │
     │                    │                    │ 6. Publish event   │
     │                    │                    │    to Redis        │
     │                    │                    ├───────────────────►│
     │                    │                    │                    │
     │                    │                    │ 7. Redis broadcasts│
     │                    │                    │◄───────────────────┤
     │                    │                    │                    │
     │ 8. WebSocket Event │                    │                    │
     │◄───────────────────────────────────────┤                    │
     │                    │                    │                    │
     │                    │ 9. WebSocket Event │                    │
     │                    │◄───────────────────┤                    │
     │                    │                    │                    │
     │ 10. Update UI      │                    │                    │
     │                    │ 11. Update UI      │                    │
     │                    │                    │                    │
```

**WebSocket Events:**
- `inventory.updated` - Inventory quantity changed
- `sale.created` - New sale recorded
- `product.updated` - Product information changed
- `low_stock.alert` - Product below reorder point
- `user.action` - User performed significant action

---

## 5. Security Architecture

### 5.1 Defense in Depth Strategy



```
┌─────────────────────────────────────────────────────────────────────┐
│                         Layer 1: Network Security                    │
│  • Cloudflare WAF (Web Application Firewall)                        │
│  • DDoS Protection                                                   │
│  • IP Reputation Filtering                                          │
│  • Bot Detection                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                      Layer 2: Transport Security                     │
│  • TLS 1.3 Only                                                     │
│  • Strong Cipher Suites                                             │
│  • HSTS (HTTP Strict Transport Security)                           │
│  • Certificate Pinning (Optional)                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                     Layer 3: Application Gateway                     │
│  • Nginx Reverse Proxy                                              │
│  • Rate Limiting (100 req/min per IP)                              │
│  • Request Size Limits                                              │
│  • Security Headers Injection                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                    Layer 4: Authentication Layer                     │
│  • JWT with short expiration (15 min)                              │
│  • Refresh Token (7 days)                                           │
│  • HTTP-only, Secure, SameSite cookies                             │
│  • Session management in Redis                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                    Layer 5: Authorization Layer                      │
│  • Role-Based Access Control (RBAC)                                 │
│  • Permission-Based Access                                          │
│  • Resource-Level Authorization                                     │
│  • Principle of Least Privilege                                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                    Layer 6: Input Validation Layer                   │
│  • DTO Validation (class-validator)                                │
│  • Zod Schema Validation                                            │
│  • Type Checking (TypeScript)                                       │
│  • SQL Injection Prevention (Parameterized Queries)                │
│  • XSS Prevention (Output Encoding)                                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                       Layer 7: Business Logic                        │
│  • Authorization Checks                                             │
│  • Data Validation                                                  │
│  • Audit Logging                                                    │
│  • Transaction Management                                           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                        Layer 8: Data Layer                           │
│  • Database Encryption at Rest                                      │
│  • Encrypted Backups                                                │
│  • Column-Level Encryption (Sensitive Data)                        │
│  • Database Access Controls                                         │
└─────────────────────────────────────────────────────────────────────┘
```



### 5.2 Authentication Architecture

**Token Strategy:**

```typescript
// Access Token (JWT)
{
  userId: string,
  email: string,
  role: string,
  permissions: string[],
  sessionId: string,
  iat: number,
  exp: number  // 15 minutes
}

// Refresh Token (JWT)
{
  userId: string,
  sessionId: string,
  tokenVersion: number,  // For invalidation
  iat: number,
  exp: number  // 7 days
}
```

**Session Management:**

```
Redis Session Store:
Key: session:{sessionId}
Value: {
  userId: string,
  role: string,
  ipAddress: string,
  userAgent: string,
  lastActivity: timestamp,
  createdAt: timestamp
}
TTL: 8 hours (absolute timeout)
```

**Account Security:**

- Password Requirements: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special
- Password Hashing: bcrypt with 12 rounds
- Account Lockout: 5 failed attempts → 15 minute lockout
- Password Expiry: 90 days (configurable)
- Force Password Change: First login, after reset
- Concurrent Sessions: Max 3 per user



### 5.3 Authorization Matrix

| Resource | Owner | Admin | Staff |
|----------|-------|-------|-------|
| **Users** |
| View All Users | ✓ | ✓ | ✗ |
| Create User | ✓ | ✓ | ✗ |
| Edit User | ✓ | ✓ (not Owner) | ✗ |
| Deactivate User | ✓ | ✓ (not Owner) | ✗ |
| Delete User | ✓ | ✗ | ✗ |
| **Products** |
| View Products | ✓ | ✓ | ✓ |
| Create Product | ✓ | ✓ | ✗ |
| Edit Product | ✓ | ✓ | ✗ |
| Delete Product | ✓ | ✓ | ✗ |
| Disable Product | ✓ | ✓ | ✗ |
| **Inventory** |
| View Inventory | ✓ | ✓ | ✓ |
| Receive Stock | ✓ | ✓ | ✓ |
| Adjust Stock | ✓ | ✓ | ✗ |
| View Inventory Logs | ✓ | ✓ | ✗ |
| **Sales** |
| Create Sale | ✓ | ✓ | ✓ |
| View All Sales | ✓ | ✓ | ✗ |
| View Own Sales | ✓ | ✓ | ✓ |
| Void Sale | ✓ | ✓ | ✗ |
| Refund Sale | ✓ | ✓ | ✗ |
| **Reports** |
| View All Reports | ✓ | ✓ | ✗ |
| Export Reports | ✓ | ✓ | ✗ |
| **Audit Logs** |
| View Audit Logs | ✓ | ✗ | ✗ |
| **Settings** |
| System Settings | ✓ | ✗ | ✗ |
| Shop Settings | ✓ | ✓ | ✗ |

### 5.4 Security Headers

```nginx
# Nginx Configuration
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss:; frame-ancestors 'none';" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```



### 5.5 Data Protection

**Sensitive Data Handling:**

1. **Passwords**
   - Never stored in plain text
   - bcrypt with 12 rounds
   - Never logged or exposed in API responses

2. **Personal Information**
   - Encrypted at rest (database-level encryption)
   - Masked in logs
   - Access controlled via RBAC

3. **Audit Logs**
   - Immutable (append-only)
   - Retention: 2 years
   - Access limited to Owner role

4. **Session Tokens**
   - Refresh tokens in HTTP-only cookies
   - Access tokens in memory (not localStorage)
   - Automatic rotation on use

---

## 6. Infrastructure Architecture

### 6.1 Single-Server Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Ubuntu Server 22.04 LTS                      │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                        Docker Network                            ││
│  │                                                                   ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          ││
│  │  │    Nginx     │  │   Frontend   │  │   Backend    │          ││
│  │  │   Container  │  │   Container  │  │   Container  │          ││
│  │  │   (Port 80,  │  │  (Next.js)   │  │   (NestJS)   │          ││
│  │  │     443)     │  │              │  │              │          ││
│  │  └──────┬───────┘  └──────────────┘  └──────┬───────┘          ││
│  │         │                                     │                  ││
│  │  ┌──────▼──────────────────────────────────┼─────────┐         ││
│  │  │              Internal Network             │         │         ││
│  │  └──────────────────────────────────────────┼─────────┘         ││
│  │                                              │                   ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────▼────────┐          ││
│  │  │  PostgreSQL  │  │    Redis     │  │   Prometheus │          ││
│  │  │   Container  │  │   Container  │  │   Container  │          ││
│  │  │              │  │              │  │              │          ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘          ││
│  │                                                                   ││
│  └───────────────────────────────────────────────────────────────────┘│
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      Docker Volumes                              ││
│  │  • postgres_data (Database)                                      ││
│  │  • redis_data (Cache)                                            ││
│  │  • prometheus_data (Metrics)                                     ││
│  │  • nginx_logs (Access Logs)                                      ││
│  │  • app_logs (Application Logs)                                   ││
│  └───────────────────────────────────────────────────────────────────┘│
│                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```



### 6.2 Container Architecture

**Docker Compose Services:**

1. **nginx** - Reverse proxy, SSL termination, static file serving
   - Ports: 80, 443
   - Networks: public, internal
   - Volumes: nginx_conf, ssl_certs, nginx_logs

2. **frontend** - Next.js application
   - Internal port: 3000
   - Networks: internal
   - Environment: Production build

3. **backend** - NestJS API server
   - Internal port: 4000
   - Networks: internal
   - Volumes: app_logs
   - Dependencies: postgres, redis

4. **postgres** - PostgreSQL database
   - Internal port: 5432
   - Networks: internal
   - Volumes: postgres_data, postgres_backups
   - Environment: Production credentials

5. **redis** - Redis cache and pub/sub
   - Internal port: 6379
   - Networks: internal
   - Volumes: redis_data
   - Configuration: Persistence enabled

6. **prometheus** - Metrics collection
   - Internal port: 9090
   - Networks: internal
   - Volumes: prometheus_data, prometheus_config

**Resource Allocation:**

| Service | CPU Limit | Memory Limit | Storage |
|---------|-----------|--------------|---------|
| Nginx | 0.5 cores | 512 MB | 10 GB |
| Frontend | 1.0 core | 1 GB | 5 GB |
| Backend | 2.0 cores | 2 GB | 10 GB |
| PostgreSQL | 2.0 cores | 4 GB | 100 GB |
| Redis | 0.5 cores | 1 GB | 10 GB |
| Prometheus | 0.5 cores | 1 GB | 20 GB |

**Total Requirements:**
- CPU: 6.5 cores (recommended: 8 cores)
- RAM: 9.5 GB (recommended: 16 GB)
- Storage: 155 GB (recommended: 200 GB SSD)



### 6.3 Network Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Internet                                      │
└────────────────────────────┬──────────────────────────────────────────┘
                             │
                             │ HTTPS (443)
                             │
┌────────────────────────────▼──────────────────────────────────────────┐
│                        Cloudflare CDN/WAF                             │
│  • SSL/TLS Termination (Re-encrypt)                                   │
│  • DDoS Protection                                                    │
│  • Web Application Firewall                                           │
│  • Rate Limiting (Global)                                             │
└────────────────────────────┬──────────────────────────────────────────┘
                             │
                             │ HTTPS (443)
                             │
┌────────────────────────────▼──────────────────────────────────────────┐
│                    Ubuntu Server Public IP                            │
│                                                                        │
│  Firewall Rules (UFW):                                                │
│  • Allow 22/tcp (SSH) - From specific IPs only                        │
│  • Allow 80/tcp (HTTP) - Redirect to HTTPS                            │
│  • Allow 443/tcp (HTTPS)                                              │
│  • Deny all other inbound traffic                                     │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    Docker Bridge Network                          │ │
│  │                    (172.18.0.0/16)                                │ │
│  │                                                                    │ │
│  │  Frontend:     172.18.0.10                                        │ │
│  │  Backend:      172.18.0.20                                        │ │
│  │  PostgreSQL:   172.18.0.30                                        │ │
│  │  Redis:        172.18.0.40                                        │ │
│  │  Prometheus:   172.18.0.50                                        │ │
│  │  Nginx:        172.18.0.100 (Gateway to host)                     │ │
│  │                                                                    │ │
│  │  Inter-Container Communication:                                   │ │
│  │  • Frontend → Backend (HTTP)                                      │ │
│  │  • Backend → PostgreSQL (PostgreSQL Protocol)                     │ │
│  │  • Backend → Redis (Redis Protocol)                               │ │
│  │  • Backend → Prometheus (Metrics Push)                            │ │
│  │  • No direct external access to internal services                 │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Network Segmentation:**

- **Public Network:** Only Nginx exposed to host network
- **Internal Network:** All application services isolated
- **Database Network:** PostgreSQL accessible only by backend
- **No Container-to-Host:** Containers cannot reach host directly

---

## 7. Scalability and Performance

### 7.1 Current Architecture Scaling Limits

| Component | Current Capacity | Scaling Approach |
|-----------|------------------|------------------|
| **Concurrent Users** | 50 | Vertical scaling → Horizontal |
| **Transactions/Day** | 10,000 | Database optimization |
| **API Requests/Min** | 5,000 | Add load balancer + replicas |
| **Database Size** | 100 GB | Partition tables, archive old data |
| **WebSocket Connections** | 100 | Redis pub/sub cluster |

### 7.2 Performance Optimization Strategies



**Database Level:**

1. **Indexing Strategy**
   - Primary keys on all tables
   - Foreign key indexes
   - Compound indexes for common queries
   - Partial indexes for filtered queries
   
   ```sql
   -- Example indexes
   CREATE INDEX idx_sales_created_at ON sales(created_at DESC);
   CREATE INDEX idx_sales_user_id ON sales(user_id);
   CREATE INDEX idx_inventory_product_variant ON inventory(product_variant_id);
   CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action);
   ```

2. **Query Optimization**
   - Avoid N+1 queries (use Prisma includes)
   - Use database views for complex reports
   - Implement pagination on all list endpoints
   - Use connection pooling (default 10 connections)

3. **Caching Strategy**
   ```
   Cache Layers:
   • L1: In-memory cache (backend application)
   • L2: Redis cache (shared across instances)
   • L3: Database query cache
   
   Cache Invalidation:
   • Time-based: Short TTL for frequently changing data
   • Event-based: Invalidate on data mutations
   • Tag-based: Group related cache entries
   ```

4. **Data Archival**
   - Move old sales (>1 year) to archive tables
   - Compress old audit logs
   - Maintain rolling 90-day hot data

**Application Level:**

1. **API Optimization**
   - Response compression (gzip)
   - Field filtering (return only requested fields)
   - Batch endpoints for bulk operations
   - Request deduplication

2. **Frontend Optimization**
   - Code splitting
   - Lazy loading of routes
   - Image optimization (Next.js Image)
   - Asset caching via CDN
   - Bundle size monitoring

3. **Real-Time Optimization**
   - WebSocket connection pooling
   - Event batching (send updates every 100ms)
   - Client-side debouncing
   - Selective subscription (only relevant events)

### 7.3 Horizontal Scaling Path

**Phase 1: Current (Single Server)**
```
1 Server → All services containerized
```

**Phase 2: Database Separation (When needed)**
```
Application Server + Separate Database Server
```

**Phase 3: Load Balancing (>50 concurrent users)**
```
Load Balancer → Multiple Application Servers → Shared Database + Redis Cluster
```

**Phase 4: Microservices (>500 concurrent users)**
```
API Gateway → Separate services (Auth, Products, Sales, Reports) → Service mesh
```



---

## 8. Monitoring and Observability

### 8.1 Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Monitoring Stack                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐│
│  │  Application │────────►│  Prometheus  │────────►│   Grafana    ││
│  │   Metrics    │         │   (Metrics)  │         │  (Dashboards)││
│  │  (Backend)   │         │              │         │              ││
│  └──────────────┘         └──────────────┘         └──────────────┘│
│                                                                       │
│  ┌──────────────┐         ┌──────────────┐                          │
│  │   Winston    │────────►│  Log Files   │                          │
│  │   Logger     │         │   (JSON)     │                          │
│  └──────────────┘         └──────────────┘                          │
│                                                                       │
│  ┌──────────────┐         ┌──────────────┐                          │
│  │   Health     │────────►│  Alerting    │────────► Email/SMS       │
│  │   Checks     │         │   System     │                          │
│  └──────────────┘         └──────────────┘                          │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 8.2 Metrics Collection

**Application Metrics:**

1. **Request Metrics**
   - HTTP request count (by endpoint, status code, method)
   - Request duration histogram
   - Request size
   - Response size

2. **Business Metrics**
   - Sales count per hour/day
   - Revenue per hour/day
   - Active users count
   - Inventory changes per day
   - Low stock items count

3. **System Metrics**
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network I/O
   - Container health

4. **Database Metrics**
   - Query execution time
   - Connection pool usage
   - Slow queries count
   - Database size
   - Table sizes

5. **Cache Metrics**
   - Cache hit rate
   - Cache miss rate
   - Eviction count
   - Memory usage

6. **WebSocket Metrics**
   - Active connections
   - Messages per second
   - Connection duration
   - Failed connections



### 8.3 Logging Strategy

**Log Levels:**

```
ERROR   → System errors, exceptions, failed operations
WARN    → Potentially harmful situations, deprecated features
INFO    → General informational messages, significant events
DEBUG   → Detailed information for debugging (dev/staging only)
```

**Log Structure (JSON):**

```json
{
  "timestamp": "2026-06-11T10:30:45.123Z",
  "level": "INFO",
  "service": "backend",
  "module": "SalesService",
  "message": "Sale created successfully",
  "context": {
    "saleId": "uuid",
    "userId": "uuid",
    "amount": 125.50,
    "items": 3
  },
  "requestId": "req-uuid",
  "sessionId": "session-uuid",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0..."
}
```

**Log Retention:**

- ERROR logs: 90 days
- WARN logs: 60 days
- INFO logs: 30 days
- DEBUG logs: 7 days (only in non-production)

**Sensitive Data Handling:**

- Never log passwords
- Mask credit card numbers
- Mask email addresses (show first 2 chars)
- Redact PII in logs

### 8.4 Alerting Rules

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| **High Error Rate** | >5% of requests fail | Critical | Immediate notification |
| **Slow Response Time** | P95 > 1s for 5 min | Warning | Investigate |
| **Database Connection Pool** | >80% utilization | Warning | Scale up |
| **Disk Space** | >85% used | Critical | Clean up / expand |
| **Memory Usage** | >90% for 5 min | Critical | Restart / scale |
| **Failed Login Attempts** | >10/min from same IP | Security | Block IP |
| **Low Stock** | Product below reorder point | Info | Email to admin |
| **SSL Certificate Expiry** | <30 days | Warning | Renew certificate |
| **Backup Failure** | Backup job failed | Critical | Manual intervention |
| **WebSocket Disconnects** | >10% connections drop | Warning | Investigate |

---

## 9. Disaster Recovery Architecture

### 9.1 Backup Strategy



**Backup Schedule:**

| Backup Type | Frequency | Retention | Storage Location |
|-------------|-----------|-----------|------------------|
| **Full Database** | Daily at 2 AM | 7 days hot, 30 days warm | S3/Remote server |
| **Incremental Database** | Every 6 hours | 48 hours | Local + S3 |
| **Transaction Logs** | Continuous | 7 days | Local + S3 |
| **Application Logs** | Daily | 30 days | S3 |
| **Configuration Files** | On change | Indefinite | Git + S3 |
| **Docker Volumes** | Weekly | 4 weeks | S3 |

**Backup Process:**

```bash
# Automated backup script (cron job)
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
S3_BUCKET="s3://vape-shop-backups"

# 1. Database backup
docker exec postgres pg_dump -U postgres vape_shop_db | \
  gzip > $BACKUP_DIR/db_$TIMESTAMP.sql.gz

# 2. Encrypt backup
openssl enc -aes-256-cbc -salt \
  -in $BACKUP_DIR/db_$TIMESTAMP.sql.gz \
  -out $BACKUP_DIR/db_$TIMESTAMP.sql.gz.enc \
  -pass file:/secure/backup_key

# 3. Upload to S3
aws s3 cp $BACKUP_DIR/db_$TIMESTAMP.sql.gz.enc $S3_BUCKET/database/

# 4. Cleanup old local backups (keep 3 days)
find $BACKUP_DIR -name "db_*.sql.gz.enc" -mtime +3 -delete

# 5. Verify backup integrity
# (Check file size, test restore on staging)
```

### 9.2 Recovery Procedures

**Recovery Point Objective (RPO):** 6 hours  
**Recovery Time Objective (RTO):** 4 hours

**Recovery Scenarios:**

1. **Database Corruption**
   - Stop application
   - Restore latest backup
   - Replay transaction logs
   - Verify data integrity
   - Restart application
   - Estimated time: 2 hours

2. **Complete Server Failure**
   - Provision new server
   - Install Docker and dependencies
   - Restore Docker volumes
   - Restore database from backup
   - Update DNS records
   - Estimated time: 4 hours

3. **Application Failure**
   - Rollback to previous Docker image
   - Or deploy from Git repository
   - Estimated time: 30 minutes

4. **Data Loss (Accidental Deletion)**
   - Identify deletion timestamp
   - Restore from point-in-time backup
   - Extract specific data
   - Merge with current database
   - Estimated time: 1-2 hours

### 9.3 High Availability Considerations

**Single Point of Failure Analysis:**

| Component | SPOF? | Mitigation (Future) |
|-----------|-------|---------------------|
| **Server** | Yes | Add standby server with failover |
| **Database** | Yes | PostgreSQL streaming replication |
| **Application** | Yes | Multiple containers + load balancer |
| **Network** | Yes | Multiple network paths |
| **Power** | Yes | UPS + generator |

**For Phase 1:**
- Focus on quick recovery rather than high availability
- Automated backups and tested recovery procedures
- Monitoring and alerting to detect failures quickly



---

## 10. Development and Deployment Pipeline

### 10.1 CI/CD Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Development Flow                             │
└─────────────────────────────────────────────────────────────────────┘

Developer → Git Push → GitHub Repository

                         ↓

┌─────────────────────────────────────────────────────────────────────┐
│                      GitHub Actions CI/CD                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Step 1: Code Quality Checks                                        │
│  • Checkout code                                                     │
│  • Install dependencies                                              │
│  • Run ESLint (frontend + backend)                                  │
│  • Run Prettier check                                                │
│  • TypeScript compilation check                                      │
│                                                                       │
│  Step 2: Security Scanning                                          │
│  • Dependency vulnerability scan (npm audit)                         │
│  • SAST (Static Application Security Testing)                        │
│  • Secret scanning                                                   │
│                                                                       │
│  Step 3: Unit Tests                                                 │
│  • Backend unit tests (Jest)                                        │
│  • Frontend unit tests (Jest + React Testing Library)              │
│  • Coverage report (minimum 70%)                                     │
│                                                                       │
│  Step 4: Integration Tests                                          │
│  • API integration tests (Supertest)                                │
│  • Database integration tests                                        │
│  • E2E tests (Playwright) [on staging]                              │
│                                                                       │
│  Step 5: Build                                                       │
│  • Build frontend (Next.js production build)                        │
│  • Build backend (NestJS production build)                          │
│  • Build Docker images                                               │
│  • Tag images with commit SHA                                        │
│                                                                       │
│  Step 6: Push to Registry                                           │
│  • Push Docker images to registry                                   │
│  • Update image tags                                                 │
│                                                                       │
│  Step 7: Deploy to Staging (auto)                                   │
│  • Deploy to staging environment                                     │
│  • Run smoke tests                                                   │
│  • Notify team in Slack                                             │
│                                                                       │
│  Step 8: Deploy to Production (manual approval)                     │
│  • Wait for manual approval                                         │
│  • Backup database                                                   │
│  • Deploy to production                                              │
│  • Run health checks                                                 │
│  • Rollback on failure                                              │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```



### 10.2 Environment Strategy

| Environment | Purpose | Deployment | Data |
|-------------|---------|------------|------|
| **Development** | Local development | Manual (docker-compose) | Seed data |
| **Staging** | Testing before production | Auto on merge to `develop` | Sanitized production copy |
| **Production** | Live system | Manual approval on `main` | Real data |

**Environment Variables Management:**

```
Development:   .env.local (not committed)
Staging:       GitHub Secrets → Injected at deploy time
Production:    GitHub Secrets → Injected at deploy time

Never commit:
• Database credentials
• API keys
• JWT secrets
• Encryption keys
```

### 10.3 Deployment Process

**Pre-Deployment Checklist:**

- [ ] All tests passing
- [ ] Code review completed
- [ ] Security scan clean
- [ ] Database migrations prepared
- [ ] Backup completed
- [ ] Rollback plan ready
- [ ] Team notified
- [ ] Maintenance window scheduled (if needed)

**Deployment Steps:**

```bash
# 1. SSH to production server
ssh user@production-server

# 2. Navigate to application directory
cd /opt/vape-shop-system

# 3. Pull latest code (or use image registry)
git pull origin main

# 4. Backup database
./scripts/backup-database.sh

# 5. Run database migrations
docker-compose exec backend npm run prisma:migrate:deploy

# 6. Pull latest Docker images
docker-compose pull

# 7. Recreate containers with new images
docker-compose up -d --no-deps --build backend frontend

# 8. Run health checks
./scripts/health-check.sh

# 9. Monitor logs for errors
docker-compose logs -f --tail=100

# 10. Verify functionality
# - Login test
# - Create sale test
# - View reports test
```

**Rollback Procedure:**

```bash
# 1. Rollback Docker images to previous version
docker-compose down
docker-compose up -d --no-deps backend:previous-tag frontend:previous-tag

# 2. Rollback database migration (if needed)
docker-compose exec backend npm run prisma:migrate:resolve --rolled-back <migration_name>

# 3. Restore database from backup (if severe)
./scripts/restore-database.sh <backup_timestamp>

# 4. Verify system is operational
./scripts/health-check.sh
```

### 10.4 Zero-Downtime Deployment (Future Enhancement)

```
1. Run new version alongside old version
2. Health check new version
3. Gradually shift traffic to new version (10% → 50% → 100%)
4. Monitor error rates and performance
5. Complete cutover or rollback based on metrics
6. Terminate old version
```

---

## 11. Technology Decision Records

### TDR-001: Why NestJS over Express?

**Decision:** Use NestJS for backend framework

**Rationale:**
- Built-in dependency injection (better for testing)
- Modular architecture enforces best practices
- Built-in support for WebSockets, validation, guards
- TypeScript-first framework
- Enterprise-ready with extensive documentation
- Active community and ecosystem

**Trade-offs:**
- Steeper learning curve than Express
- More opinionated (less flexibility)
- Slightly larger bundle size

**Status:** Accepted

### TDR-002: Why Prisma over TypeORM?

**Decision:** Use Prisma as ORM

**Rationale:**
- Better TypeScript integration and type inference
- Prisma Studio for database visualization
- Simpler migration workflow
- Better query performance
- Auto-generated types from schema
- Excellent developer experience

**Trade-offs:**
- Newer than TypeORM (less mature)
- Some advanced features still in development
- Requires Prisma schema in addition to TypeScript types

**Status:** Accepted



### TDR-003: Why Next.js over Create React App?

**Decision:** Use Next.js for frontend

**Rationale:**
- Server-side rendering for better performance
- Built-in routing (no need for React Router)
- API routes capability
- Image optimization out of the box
- Better SEO (though not critical for this app)
- Production-ready with minimal configuration
- File-based routing is intuitive

**Trade-offs:**
- More complex than CRA
- Server component considerations
- Deployment requires Node.js server (not just static hosting)

**Status:** Accepted

### TDR-004: Why PostgreSQL over MongoDB?

**Decision:** Use PostgreSQL as primary database

**Rationale:**
- Strong consistency guarantees (ACID)
- Relational data model fits inventory/sales domain perfectly
- Complex queries and joins are common (reports)
- Foreign key constraints prevent data inconsistencies
- Battle-tested for financial data
- Excellent TypeScript support via Prisma

**Trade-offs:**
- Schema changes require migrations
- Less flexible than NoSQL for unstructured data
- Vertical scaling limits (but not a concern at this scale)

**Status:** Accepted

### TDR-005: Why Redis over Memcached?

**Decision:** Use Redis for caching and real-time features

**Rationale:**
- Pub/sub support for WebSocket broadcasting
- Multiple data structures (not just key-value)
- Persistence options for session storage
- Lua scripting for complex operations
- Better for rate limiting implementation
- Widely used and well-documented

**Trade-offs:**
- Single-threaded (but not an issue at this scale)
- More memory usage than Memcached
- More complex than Memcached

**Status:** Accepted

### TDR-006: Monolith vs Microservices

**Decision:** Start with modular monolith, design for eventual microservices

**Rationale:**
- Simpler to develop, test, and deploy initially
- Easier to reason about for small team
- Lower operational overhead
- Can split into microservices when needed
- Modular NestJS architecture makes future split easier

**Future Path:**
- Extract high-load services (e.g., reporting) when needed
- Use API gateway pattern for gradual migration

**Status:** Accepted

---

## 12. Architecture Review Checklist

### 12.1 Functional Requirements

- [x] Multi-role user management (Owner, Admin, Staff)
- [x] Product and inventory management
- [x] Sales transaction processing
- [x] Real-time updates via WebSocket
- [x] Reporting and analytics
- [x] Audit logging
- [x] Age verification capability
- [x] Supplier management
- [x] Customer management
- [x] Cash drawer tracking

### 12.2 Non-Functional Requirements

- [x] Security (defense in depth, RBAC, encryption)
- [x] Performance (caching, optimization, indexing)
- [x] Scalability (horizontal scaling path defined)
- [x] Reliability (backup and recovery procedures)
- [x] Maintainability (clean architecture, documentation)
- [x] Monitoring (metrics, logging, alerting)
- [x] Deployment (CI/CD, containerization)

### 12.3 Architecture Quality Attributes

- [x] **Separation of Concerns:** Frontend, backend, database clearly separated
- [x] **Modularity:** NestJS modules, reusable components
- [x] **Security:** Multiple security layers, least privilege
- [x] **Testability:** Unit tests, integration tests, E2E tests
- [x] **Observability:** Comprehensive logging and monitoring
- [x] **Recoverability:** Backup and disaster recovery plan
- [x] **Extensibility:** Can add new features without major refactoring

---

## 13. Next Steps

1. ✅ Requirements Analysis Complete
2. ✅ System Architecture Complete
3. ➡️ **Next: Database Schema Design**
   - Create comprehensive Prisma schema
   - Define all tables, relationships, constraints
   - Plan indexes and optimizations
   
4. ➡️ API Design and Specifications
5. ➡️ Security Architecture Deep Dive
6. ➡️ Implementation

---

## Appendix A: Glossary

**ACID** - Atomicity, Consistency, Isolation, Durability  
**API** - Application Programming Interface  
**CDN** - Content Delivery Network  
**CI/CD** - Continuous Integration / Continuous Deployment  
**CORS** - Cross-Origin Resource Sharing  
**CSRF** - Cross-Site Request Forgery  
**DDoS** - Distributed Denial of Service  
**DTO** - Data Transfer Object  
**HSTS** - HTTP Strict Transport Security  
**JWT** - JSON Web Token  
**ORM** - Object-Relational Mapping  
**PII** - Personally Identifiable Information  
**RBAC** - Role-Based Access Control  
**REST** - Representational State Transfer  
**RPO** - Recovery Point Objective  
**RTO** - Recovery Time Objective  
**SAST** - Static Application Security Testing  
**SLA** - Service Level Agreement  
**SPOF** - Single Point of Failure  
**TLS** - Transport Layer Security  
**TTL** - Time To Live  
**WAF** - Web Application Firewall  
**XSS** - Cross-Site Scripting  

---

**Document Status:** Complete  
**Review Status:** Ready for Stakeholder Review  
**Next Document:** Database Schema Design

---

*This system architecture is designed to be production-ready, secure, scalable, and maintainable. It follows industry best practices and can support a real vape shop business while providing a path for future growth.*
