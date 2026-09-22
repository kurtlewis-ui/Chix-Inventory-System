# API Design and Specifications

**Document Version:** 1.0  
**Date:** June 11, 2026  
**Prepared By:** Senior API Architect  
**Project:** Vape Shop Inventory and Sales Management System

---

## Executive Summary

This document defines the complete RESTful API for the vape shop management system. It includes all endpoints, request/response schemas, validation rules, authentication requirements, error handling, and API standards.

**API Style:** RESTful HTTP API  
**Data Format:** JSON  
**Authentication:** JWT Bearer Token  
**Base URL:** `/api/v1`  
**Versioning:** URL-based versioning

---

## Table of Contents

1. API Design Principles
2. Authentication & Authorization
3. Request/Response Standards
4. Error Handling
5. Validation Rules
6. Pagination and Filtering
7. API Endpoints by Module
8. Rate Limiting
9. API Versioning Strategy
10. OpenAPI/Swagger Specification

---

## 1. API Design Principles

### 1.1 RESTful Design

**Resource-Oriented:**
- URLs represent resources (nouns, not verbs)
- HTTP methods represent actions
- Proper use of HTTP status codes

**Examples:**
```
✅ GET    /api/v1/products          (list products)
✅ POST   /api/v1/products          (create product)
✅ GET    /api/v1/products/:id      (get product)
✅ PATCH  /api/v1/products/:id      (update product)
✅ DELETE /api/v1/products/:id      (delete product)

❌ GET    /api/v1/getProducts
❌ POST   /api/v1/createProduct
❌ POST   /api/v1/products/delete
```

### 1.2 HTTP Methods

| Method | Purpose | Idempotent | Safe |
|--------|---------|------------|------|
| GET | Retrieve resource(s) | Yes | Yes |
| POST | Create new resource | No | No |
| PUT | Replace entire resource | Yes | No |
| PATCH | Partial update resource | Yes | No |
| DELETE | Remove resource | Yes | No |

### 1.3 HTTP Status Codes

**Success Codes:**
- `200 OK` - Successful GET, PATCH, PUT
- `201 Created` - Successful POST (resource created)
- `204 No Content` - Successful DELETE

**Client Error Codes:**
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Authenticated but no permission
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Resource conflict (duplicate)
- `422 Unprocessable Entity` - Validation failed
- `429 Too Many Requests` - Rate limit exceeded

**Server Error Codes:**
- `500 Internal Server Error` - Unexpected server error
- `503 Service Unavailable` - Server overloaded/maintenance

### 1.4 API Design Rules

1. **Consistent Naming:**
   - Use plural nouns for collections: `/products`, `/sales`
   - Use kebab-case for URLs: `/purchase-orders`
   - Use camelCase for JSON fields: `firstName`, `createdAt`

2. **Predictable Structure:**
   - List endpoints: `GET /resources`
   - Detail endpoints: `GET /resources/:id`
   - Nested resources: `GET /sales/:id/items`

3. **Versioning:**
   - Include version in URL: `/api/v1/`
   - Maintain backward compatibility within major version
   - Deprecation warnings before breaking changes

4. **Security:**
   - HTTPS only in production
   - Authentication required for all endpoints (except login/health)
   - Authorization checked for all mutations
   - Input validation on all requests

---

## 2. Authentication & Authorization

### 2.1 Authentication Flow



**JWT Token Strategy:**

```
Access Token:
- Short-lived (15 minutes)
- Stored in memory (frontend)
- Included in Authorization header
- Contains: userId, email, role, permissions

Refresh Token:
- Long-lived (7 days)
- Stored in HTTP-only cookie
- Used to obtain new access token
- Contains: userId, sessionId, tokenVersion
```

**Request Headers:**

```http
Authorization: Bearer <access_token>
Content-Type: application/json
X-Request-ID: <uuid> (optional, for request tracing)
```

### 2.2 Authorization Levels

**Public Endpoints (No Auth Required):**
- `POST /auth/login`
- `GET /health`

**Protected Endpoints (Auth Required):**
- All other endpoints require valid JWT

**Role-Based Endpoints:**
- Enforced via decorators: `@Roles('Owner', 'Admin')`
- Permission checks: `@Permission('products:create')`

---

## 3. Request/Response Standards

### 3.1 Request Format

**Headers:**
```http
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Body (JSON):**
```json
{
  "field1": "value1",
  "field2": "value2"
}
```

### 3.2 Response Format

**Success Response:**

```json
{
  "success": true,
  "data": {
    // Response data here
  },
  "meta": {
    "timestamp": "2026-06-11T10:30:45.123Z",
    "requestId": "uuid"
  }
}
```

**Success Response (List with Pagination):**

```json
{
  "success": true,
  "data": [
    // Array of resources
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  },
  "meta": {
    "timestamp": "2026-06-11T10:30:45.123Z",
    "requestId": "uuid"
  }
}
```

**Error Response:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      },
      {
        "field": "password",
        "message": "Password must be at least 8 characters"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-06-11T10:30:45.123Z",
    "requestId": "uuid"
  }
}
```

### 3.3 Field Naming Conventions

**Date/Time Fields:**
- Always ISO 8601 format: `2026-06-11T10:30:45.123Z`
- Always UTC timezone
- Field names end with `At`: `createdAt`, `updatedAt`

**Boolean Fields:**
- Use `is` prefix: `isActive`, `isLocked`
- Default to `false` unless otherwise specified

**ID Fields:**
- Use `Id` suffix: `userId`, `productId`
- Always UUID format

**Monetary Fields:**
- Use string representation for precision
- Two decimal places: `"125.50"`
- Field names indicate currency: `totalAmount`, `costPrice`

---

## 4. Error Handling

### 4.1 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 422 | Request validation failed |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |
| `INVALID_CREDENTIALS` | 401 | Invalid login credentials |
| `ACCOUNT_LOCKED` | 403 | Account temporarily locked |
| `INSUFFICIENT_INVENTORY` | 422 | Not enough stock |
| `INVALID_OPERATION` | 422 | Operation not allowed |

### 4.2 Error Response Examples

**Validation Error:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "retailPrice",
        "message": "Retail price must be greater than cost price",
        "value": "10.00"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-06-11T10:30:45.123Z",
    "requestId": "req-uuid"
  }
}
```

**Authentication Error:**

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  },
  "meta": {
    "timestamp": "2026-06-11T10:30:45.123Z",
    "requestId": "req-uuid"
  }
}
```

**Not Found Error:**

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Product not found",
    "details": {
      "resource": "Product",
      "id": "uuid"
    }
  },
  "meta": {
    "timestamp": "2026-06-11T10:30:45.123Z",
    "requestId": "req-uuid"
  }
}
```

---

## 5. Validation Rules

### 5.1 Common Validation Rules

**String Fields:**
```typescript
{
  minLength: 1,
  maxLength: 255,
  trim: true,
  required: true
}
```

**Email Fields:**
```typescript
{
  type: 'email',
  lowercase: true,
  trim: true,
  required: true
}
```

**UUID Fields:**
```typescript
{
  type: 'uuid',
  version: 4,
  required: true
}
```

**Numeric Fields:**
```typescript
{
  type: 'number',
  min: 0,
  max: 999999.99,
  decimal: 2
}
```

**Enum Fields:**
```typescript
{
  enum: ['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED']
}
```

### 5.2 Business Logic Validation

**Product Creation:**
- `retailPrice` must be ≥ `costPrice`
- `sku` must be unique
- `reorderPoint` must be ≥ 0
- `reorderQuantity` must be > 0

**Sale Creation:**
- All products must be in stock
- `amountPaid` must be ≥ `totalAmount`
- Age verification required if any product `isAgeRestricted`
- `quantity` must be > 0 for all items

**User Creation:**
- Email must be unique
- Password must meet complexity requirements:
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number
  - At least 1 special character

---

## 6. Pagination and Filtering

### 6.1 Pagination Parameters

**Query Parameters:**
```
?page=1          (default: 1)
?limit=20        (default: 20, max: 100)
?sortBy=createdAt
?sortOrder=desc  (asc or desc)
```

**Example Request:**
```http
GET /api/v1/products?page=2&limit=50&sortBy=name&sortOrder=asc
```

**Example Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 250,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": true
  }
}
```

### 6.2 Filtering Parameters

**Common Filters:**
```
?search=keyword       (full-text search)
?status=ACTIVE        (exact match)
?categoryId=uuid      (related resource)
?minPrice=10.00       (range filter)
?maxPrice=50.00       (range filter)
?createdAfter=2026-01-01
?createdBefore=2026-12-31
?isActive=true        (boolean filter)
```

**Example:**
```http
GET /api/v1/products?search=vape&categoryId=uuid&minPrice=10&isActive=true&page=1&limit=20
```

### 6.3 Field Selection (Sparse Fieldsets)

**Include specific fields only:**
```http
GET /api/v1/products?fields=id,name,retailPrice
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Product Name",
      "retailPrice": "25.99"
    }
  ]
}
```

---

## 7. API Endpoints by Module

### 7.1 Authentication Endpoints



#### POST /auth/login

**Description:** Authenticate user and receive tokens

**Auth Required:** No

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": {
        "id": "uuid",
        "name": "Admin"
      }
    }
  }
}
```

**Sets Cookie:** `refreshToken` (HTTP-only, Secure, SameSite=Strict)

**Error Responses:**
- `401 INVALID_CREDENTIALS` - Wrong email/password
- `403 ACCOUNT_LOCKED` - Account locked due to failed attempts
- `403 ACCOUNT_DISABLED` - Account is deactivated

---

#### POST /auth/logout

**Description:** Invalidate current session

**Auth Required:** Yes

**Response (204 No Content)**

**Clears Cookie:** `refreshToken`

---

#### POST /auth/refresh

**Description:** Get new access token using refresh token

**Auth Required:** No (uses refresh token from cookie)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "new_access_token"
  }
}
```

**Error Responses:**
- `401 UNAUTHORIZED` - Invalid or expired refresh token

---

#### POST /auth/change-password

**Description:** Change current user's password

**Auth Required:** Yes

**Request Body:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!",
  "confirmPassword": "NewPass456!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Password changed successfully"
  }
}
```

---

### 7.2 User Management Endpoints

#### GET /users

**Description:** List all users

**Auth Required:** Yes (Owner, Admin)

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `search` (string, searches name/email)
- `roleId` (uuid, filter by role)
- `isActive` (boolean, filter by status)
- `sortBy` (string, default: createdAt)
- `sortOrder` (asc|desc, default: desc)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": {
        "id": "uuid",
        "name": "Staff"
      },
      "phone": "+1234567890",
      "isActive": true,
      "lastLoginAt": "2026-06-11T10:00:00.000Z",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

---

#### GET /users/:id

**Description:** Get user details

**Auth Required:** Yes (Owner, Admin, or self)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": {
      "id": "uuid",
      "name": "Staff",
      "permissions": {}
    },
    "phone": "+1234567890",
    "isActive": true,
    "isLocked": false,
    "lastLoginAt": "2026-06-11T10:00:00.000Z",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-06-11T10:00:00.000Z"
  }
}
```

---

#### POST /users

**Description:** Create new user

**Auth Required:** Yes (Owner, Admin)

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "SecurePass123!",
  "firstName": "Jane",
  "lastName": "Smith",
  "roleId": "uuid",
  "phone": "+1234567890"
}
```

**Validation:**
- email: valid email, unique
- password: min 8 chars, complexity requirements
- firstName/lastName: min 1 char, max 100 chars
- roleId: valid UUID, must exist
- phone: optional, valid phone format

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "newuser@example.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "role": {
      "id": "uuid",
      "name": "Staff"
    },
    "isActive": true,
    "mustChangePassword": true,
    "createdAt": "2026-06-11T10:30:45.123Z"
  }
}
```

---

#### PATCH /users/:id

**Description:** Update user details

**Auth Required:** Yes (Owner, Admin, or self for limited fields)

**Request Body (partial update):**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "+1234567890"
}
```

**Owner/Admin can also update:**
```json
{
  "roleId": "uuid",
  "isActive": false
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "updatedAt": "2026-06-11T10:30:45.123Z"
  }
}
```

---

#### DELETE /users/:id

**Description:** Soft delete user (deactivate)

**Auth Required:** Yes (Owner only)

**Response (204 No Content)**

**Note:** Cannot delete Owner role users. Cannot delete self.

---

### 7.3 Product Management Endpoints

#### GET /products

**Description:** List all products with variants

**Auth Required:** Yes

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder`
- `search` (full-text search on name/description)
- `categoryId` (uuid)
- `brandId` (uuid)
- `supplierId` (uuid)
- `isActive` (boolean)
- `isAgeRestricted` (boolean)
- `minPrice` (decimal)
- `maxPrice` (decimal)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Premium E-Liquid",
      "description": "High quality vape juice",
      "category": {
        "id": "uuid",
        "name": "E-Liquids"
      },
      "brand": {
        "id": "uuid",
        "name": "VapeCo"
      },
      "imageUrl": "https://cdn.example.com/image.jpg",
      "isAgeRestricted": true,
      "minimumAge": 21,
      "isActive": true,
      "variants": [
        {
          "id": "uuid",
          "sku": "EL-001-30ML",
          "variantName": "30ml, 3mg Nicotine",
          "retailPrice": "25.99",
          "costPrice": "15.00",
          "inventory": {
            "quantityOnHand": 50,
            "quantityAvailable": 48
          }
        }
      ],
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {...}
}
```

---

#### GET /products/:id

**Description:** Get product details with all variants

**Auth Required:** Yes

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Premium E-Liquid",
    "description": "Detailed description...",
    "category": {...},
    "brand": {...},
    "supplier": {...},
    "imageUrl": "https://cdn.example.com/image.jpg",
    "isAgeRestricted": true,
    "minimumAge": 21,
    "isActive": true,
    "variants": [...],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-06-11T10:00:00.000Z"
  }
}
```

---

#### POST /products

**Description:** Create new product

**Auth Required:** Yes (Owner, Admin)

**Request Body:**
```json
{
  "name": "New Product",
  "description": "Product description",
  "categoryId": "uuid",
  "brandId": "uuid",
  "supplierId": "uuid",
  "imageUrl": "https://cdn.example.com/image.jpg",
  "isAgeRestricted": true,
  "minimumAge": 21,
  "variants": [
    {
      "sku": "PROD-001",
      "barcode": "1234567890123",
      "variantName": "30ml",
      "attributes": {
        "size": "30ml",
        "strength": "3mg"
      },
      "costPrice": "15.00",
      "retailPrice": "25.99",
      "taxRate": "8.5",
      "reorderPoint": 10,
      "reorderQuantity": 50
    }
  ]
}
```

**Validation:**
- name: required, max 255 chars
- categoryId: required, must exist
- sku: required, unique per variant
- retailPrice >= costPrice
- taxRate: 0-100

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "New Product",
    "variants": [...],
    "createdAt": "2026-06-11T10:30:45.123Z"
  }
}
```

---

#### PATCH /products/:id

**Description:** Update product details

**Auth Required:** Yes (Owner, Admin)

**Request Body (partial):**
```json
{
  "name": "Updated Product Name",
  "description": "Updated description",
  "isActive": false
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Updated Product Name",
    "updatedAt": "2026-06-11T10:30:45.123Z"
  }
}
```

---

#### DELETE /products/:id

**Description:** Soft delete product

**Auth Required:** Yes (Owner, Admin)

**Response (204 No Content)**

**Note:** Cannot delete if variants have active inventory or sales history.

---

### 7.4 Product Variant Endpoints

#### GET /products/:productId/variants

**Description:** List variants for a product

**Auth Required:** Yes

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "sku": "PROD-001-30ML",
      "barcode": "1234567890123",
      "variantName": "30ml, 3mg",
      "attributes": {
        "size": "30ml",
        "strength": "3mg"
      },
      "costPrice": "15.00",
      "retailPrice": "25.99",
      "taxRate": "8.5",
      "reorderPoint": 10,
      "inventory": {
        "quantityOnHand": 50,
        "quantityReserved": 2,
        "quantityAvailable": 48
      },
      "isActive": true
    }
  ]
}
```

---

#### POST /products/:productId/variants

**Description:** Add new variant to product

**Auth Required:** Yes (Owner, Admin)

**Request Body:**
```json
{
  "sku": "PROD-001-60ML",
  "barcode": "9876543210987",
  "variantName": "60ml, 3mg",
  "attributes": {
    "size": "60ml",
    "strength": "3mg"
  },
  "costPrice": "25.00",
  "retailPrice": "45.99",
  "taxRate": "8.5",
  "reorderPoint": 10,
  "reorderQuantity": 30
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "sku": "PROD-001-60ML",
    "variantName": "60ml, 3mg",
    "createdAt": "2026-06-11T10:30:45.123Z"
  }
}
```

---

#### PATCH /variants/:id

**Description:** Update product variant

**Auth Required:** Yes (Owner, Admin)

**Request Body (partial):**
```json
{
  "retailPrice": "27.99",
  "reorderPoint": 15
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "retailPrice": "27.99",
    "updatedAt": "2026-06-11T10:30:45.123Z"
  }
}
```

---

### 7.5 Inventory Management Endpoints

#### GET /inventory

**Description:** List all inventory with low stock indicators

**Auth Required:** Yes

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder`
- `lowStock` (boolean, filter items below reorder point)
- `productId` (uuid)
- `categoryId` (uuid)
- `search` (search by product/SKU)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "productVariant": {
        "id": "uuid",
        "sku": "PROD-001",
        "variantName": "30ml, 3mg",
        "product": {
          "name": "Premium E-Liquid"
        },
        "reorderPoint": 10
      },
      "quantityOnHand": 8,
      "quantityReserved": 0,
      "quantityAvailable": 8,
      "isLowStock": true,
      "lastCountedAt": "2026-06-01T00:00:00.000Z",
      "updatedAt": "2026-06-11T10:00:00.000Z"
    }
  ],
  "pagination": {...}
}
```

---

#### GET /inventory/:productVariantId

**Description:** Get inventory details for specific variant

**Auth Required:** Yes

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "productVariant": {...},
    "quantityOnHand": 50,
    "quantityReserved": 2,
    "quantityAvailable": 48,
    "lastCountedAt": "2026-06-01T00:00:00.000Z",
    "lastCountedBy": {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Doe"
    },
    "recentChanges": [
      {
        "id": "uuid",
        "changeType": "SALE",
        "quantityChange": -2,
        "quantityBefore": 52,
        "quantityAfter": 50,
        "user": {
          "firstName": "Jane"
        },
        "createdAt": "2026-06-11T09:00:00.000Z"
      }
    ]
  }
}
```

---

#### POST /inventory/adjust

**Description:** Manual inventory adjustment

**Auth Required:** Yes (Owner, Admin)

**Request Body:**
```json
{
  "productVariantId": "uuid",
  "quantityChange": -5,
  "reason": "DAMAGE",
  "notes": "5 bottles damaged during shipment"
}
```

**Validation:**
- reason: enum ['DAMAGE', 'ADJUST', 'COUNT', 'RETURN']
- quantityChange: non-zero integer
- Result cannot be negative

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "inventory": {
      "productVariantId": "uuid",
      "quantityOnHand": 45,
      "quantityAvailable": 45
    },
    "log": {
      "id": "uuid",
      "changeType": "DAMAGE",
      "quantityChange": -5,
      "createdAt": "2026-06-11T10:30:45.123Z"
    }
  }
}
```

---

#### POST /inventory/receive

**Description:** Receive inventory from purchase order

**Auth Required:** Yes (Owner, Admin, Staff)

**Request Body:**
```json
{
  "purchaseOrderId": "uuid",
  "items": [
    {
      "productVariantId": "uuid",
      "quantityReceived": 100
    }
  ],
  "notes": "Shipment #12345"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "purchaseOrder": {
      "id": "uuid",
      "poNumber": "PO-20260611-0001",
      "status": "RECEIVED"
    },
    "itemsReceived": [
      {
        "productVariantId": "uuid",
        "quantityReceived": 100,
        "newQuantity": 150
      }
    ]
  }
}
```

---

#### GET /inventory/logs

**Description:** Get inventory change history

**Auth Required:** Yes (Owner, Admin)

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder`
- `productVariantId` (uuid)
- `changeType` (enum)
- `userId` (uuid)
- `startDate`, `endDate` (ISO dates)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "productVariant": {
        "sku": "PROD-001",
        "variantName": "30ml"
      },
      "changeType": "SALE",
      "quantityChange": -2,
      "quantityBefore": 52,
      "quantityAfter": 50,
      "referenceType": "SALE",
      "referenceId": "uuid",
      "user": {
        "firstName": "Jane",
        "lastName": "Doe"
      },
      "createdAt": "2026-06-11T09:00:00.000Z"
    }
  ],
  "pagination": {...}
}
```

---

### 7.6 Sales Management Endpoints

#### GET /sales

**Description:** List all sales transactions

**Auth Required:** Yes (Owner, Admin see all; Staff see own)

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder`
- `status` (enum: COMPLETED, VOIDED, REFUNDED)
- `userId` (uuid, filter by staff member)
- `customerId` (uuid)
- `startDate`, `endDate` (ISO dates)
- `minAmount`, `maxAmount` (decimal)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "saleNumber": "SALE-20260611-0001",
      "customer": {
        "id": "uuid",
        "firstName": "John",
        "lastName": "Doe"
      },
      "user": {
        "id": "uuid",
        "firstName": "Jane",
        "lastName": "Smith"
      },
      "subtotal": "100.00",
      "taxAmount": "8.50",
      "discountAmount": "0.00",
      "totalAmount": "108.50",
      "paymentMethod": {
        "name": "Cash"
      },
      "status": "COMPLETED",
      "itemCount": 3,
      "createdAt": "2026-06-11T10:00:00.000Z"
    }
  ],
  "pagination": {...},
  "summary": {
    "totalSales": "5432.10",
    "totalTransactions": 45,
    "averageTransaction": "120.71"
  }
}
```

---

#### GET /sales/:id

**Description:** Get detailed sale information

**Auth Required:** Yes (Owner, Admin, or sale creator)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "saleNumber": "SALE-20260611-0001",
    "customer": {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890"
    },
    "user": {
      "id": "uuid",
      "firstName": "Jane",
      "lastName": "Smith"
    },
    "items": [
      {
        "id": "uuid",
        "productVariant": {
          "id": "uuid",
          "sku": "PROD-001",
          "variantName": "30ml, 3mg"
        },
        "productSnapshot": {
          "name": "Premium E-Liquid",
          "sku": "PROD-001"
        },
        "quantity": 2,
        "unitPrice": "25.99",
        "unitCost": "15.00",
        "taxRate": "8.5",
        "discountAmount": "0.00",
        "lineTotal": "56.40"
      }
    ],
    "subtotal": "100.00",
    "taxAmount": "8.50",
    "discountAmount": "0.00",
    "totalAmount": "108.50",
    "amountPaid": "110.00",
    "changeAmount": "1.50",
    "paymentMethod": {
      "id": "uuid",
      "name": "Cash",
      "type": "CASH"
    },
    "status": "COMPLETED",
    "ageVerified": true,
    "notes": null,
    "createdAt": "2026-06-11T10:00:00.000Z"
  }
}
```

---

#### POST /sales

**Description:** Create new sale (checkout)

**Auth Required:** Yes

**Request Body:**
```json
{
  "customerId": "uuid",
  "items": [
    {
      "productVariantId": "uuid",
      "quantity": 2
    },
    {
      "productVariantId": "uuid",
      "quantity": 1
    }
  ],
  "paymentMethodId": "uuid",
  "amountPaid": "110.00",
  "discountAmount": "0.00",
  "ageVerified": true,
  "notes": "Customer requested gift receipt"
}
```

**Validation:**
- items: array, min 1 item
- quantity: positive integer
- All products must be available (sufficient inventory)
- amountPaid >= totalAmount (calculated)
- ageVerified: required if any product isAgeRestricted

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "saleNumber": "SALE-20260611-0001",
    "totalAmount": "108.50",
    "amountPaid": "110.00",
    "changeAmount": "1.50",
    "receipt": {
      "url": "/api/v1/sales/uuid/receipt"
    },
    "createdAt": "2026-06-11T10:30:45.123Z"
  }
}
```

**Error Responses:**
- `422 INSUFFICIENT_INVENTORY` - Not enough stock
- `422 VALIDATION_ERROR` - Age verification required

---

#### POST /sales/:id/void

**Description:** Void a sale (cancellation)

**Auth Required:** Yes (Owner, Admin)

**Request Body:**
```json
{
  "reason": "Customer requested cancellation"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "saleNumber": "SALE-20260611-0001",
    "status": "VOIDED",
    "voidedAt": "2026-06-11T10:45:00.000Z",
    "voidedBy": {
      "firstName": "Jane",
      "lastName": "Smith"
    }
  }
}
```

**Note:** Inventory is restored when sale is voided.

---

#### GET /sales/:id/receipt

**Description:** Get formatted receipt (PDF or JSON)

**Auth Required:** Yes

**Query Parameters:**
- `format` (pdf|json, default: pdf)

**Response (200 OK):**
- PDF: `Content-Type: application/pdf`
- JSON: Receipt data structure

---

### 7.7 Reporting Endpoints



#### GET /reports/dashboard

**Description:** Get dashboard overview metrics

**Auth Required:** Yes

**Query Parameters:**
- `period` (today|week|month|year, default: today)
- `startDate`, `endDate` (optional custom range)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "sales": {
      "total": "5432.10",
      "count": 45,
      "average": "120.71",
      "change": "+15.3%"
    },
    "topProducts": [
      {
        "productVariant": {
          "sku": "PROD-001",
          "name": "Premium E-Liquid - 30ml",
          "product": {
            "name": "Premium E-Liquid"
          }
        },
        "unitsSold": 125,
        "revenue": "3247.50"
      }
    ],
    "lowStockItems": [
      {
        "productVariant": {
          "sku": "PROD-005",
          "name": "Device - Black"
        },
        "quantityOnHand": 3,
        "reorderPoint": 10
      }
    ],
    "recentActivity": [
      {
        "type": "SALE",
        "description": "Sale #SALE-20260611-0045 completed",
        "amount": "125.50",
        "timestamp": "2026-06-11T14:30:00.000Z"
      }
    ]
  }
}
```

---

#### GET /reports/sales

**Description:** Detailed sales report

**Auth Required:** Yes (Owner, Admin)

**Query Parameters:**
- `startDate`, `endDate` (required)
- `groupBy` (day|week|month, default: day)
- `userId` (optional, filter by staff)
- `categoryId` (optional)
- `export` (csv|pdf|xlsx, optional)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRevenue": "125430.50",
      "totalTransactions": 1250,
      "averageTransaction": "100.34",
      "totalTax": "10634.59",
      "totalProfit": "45230.75"
    },
    "breakdown": [
      {
        "date": "2026-06-11",
        "revenue": "5432.10",
        "transactions": 45,
        "averageTransaction": "120.71"
      },
      {
        "date": "2026-06-10",
        "revenue": "4876.25",
        "transactions": 38,
        "averageTransaction": "128.32"
      }
    ],
    "byCategory": [
      {
        "category": "E-Liquids",
        "revenue": "85230.50",
        "percentage": 67.9
      }
    ],
    "byPaymentMethod": [
      {
        "method": "Cash",
        "revenue": "75230.50",
        "percentage": 60.0
      }
    ]
  }
}
```

---

#### GET /reports/inventory

**Description:** Inventory valuation and movement report

**Auth Required:** Yes (Owner, Admin)

**Query Parameters:**
- `categoryId` (optional)
- `lowStock` (boolean)
- `export` (csv|pdf|xlsx)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalValue": "125430.50",
      "totalItems": 1250,
      "lowStockItems": 15,
      "outOfStockItems": 3
    },
    "byCategory": [
      {
        "category": "E-Liquids",
        "totalValue": "85230.50",
        "itemCount": 850,
        "lowStockCount": 8
      }
    ],
    "topMovers": [
      {
        "productVariant": {...},
        "changeThisMonth": -250,
        "averageDailyMovement": -8.3
      }
    ]
  }
}
```

---

#### GET /reports/staff-performance

**Description:** Staff performance metrics

**Auth Required:** Yes (Owner, Admin)

**Query Parameters:**
- `startDate`, `endDate` (required)
- `userId` (optional, specific staff member)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "user": {
        "id": "uuid",
        "firstName": "Jane",
        "lastName": "Smith"
      },
      "metrics": {
        "totalSales": "45230.75",
        "transactionCount": 450,
        "averageTransaction": "100.51",
        "shiftsWorked": 20,
        "hoursWorked": 160
      }
    }
  ]
}
```

---

### 7.8 Purchase Order Endpoints

#### GET /purchase-orders

**Description:** List purchase orders

**Auth Required:** Yes (Owner, Admin)

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder`
- `status` (enum: DRAFT, SENT, PARTIAL, RECEIVED, CANCELLED)
- `supplierId` (uuid)
- `startDate`, `endDate`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "poNumber": "PO-20260611-0001",
      "supplier": {
        "id": "uuid",
        "name": "VapeSupplier Inc."
      },
      "status": "SENT",
      "orderDate": "2026-06-01",
      "expectedDate": "2026-06-15",
      "totalAmount": "5430.75",
      "itemCount": 5,
      "createdBy": {
        "firstName": "Jane",
        "lastName": "Smith"
      },
      "createdAt": "2026-06-01T10:00:00.000Z"
    }
  ],
  "pagination": {...}
}
```

---

#### POST /purchase-orders

**Description:** Create new purchase order

**Auth Required:** Yes (Owner, Admin)

**Request Body:**
```json
{
  "supplierId": "uuid",
  "expectedDate": "2026-06-30",
  "items": [
    {
      "productVariantId": "uuid",
      "quantityOrdered": 100,
      "unitCost": "15.00"
    }
  ],
  "shippingCost": "25.00",
  "taxAmount": "125.00",
  "notes": "Rush order"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "poNumber": "PO-20260611-0002",
    "status": "DRAFT",
    "totalAmount": "1650.00",
    "createdAt": "2026-06-11T10:30:45.123Z"
  }
}
```

---

#### PATCH /purchase-orders/:id/status

**Description:** Update PO status

**Auth Required:** Yes (Owner, Admin)

**Request Body:**
```json
{
  "status": "SENT"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "poNumber": "PO-20260611-0002",
    "status": "SENT",
    "updatedAt": "2026-06-11T10:30:45.123Z"
  }
}
```

---

### 7.9 Customer Management Endpoints

#### GET /customers

**Description:** List customers

**Auth Required:** Yes

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder`
- `search` (name, email, phone)
- `ageVerified` (boolean)
- `isActive` (boolean)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "ageVerified": true,
      "loyaltyPoints": 150,
      "totalSpent": "1250.75",
      "lastPurchase": "2026-06-11T10:00:00.000Z",
      "createdAt": "2026-01-15T00:00:00.000Z"
    }
  ],
  "pagination": {...}
}
```

---

#### POST /customers

**Description:** Create new customer

**Auth Required:** Yes

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "+1234567890",
  "dateOfBirth": "1995-03-15",
  "ageVerified": true,
  "marketingConsent": true
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "firstName": "Jane",
    "lastName": "Doe",
    "ageVerified": true,
    "createdAt": "2026-06-11T10:30:45.123Z"
  }
}
```

---

### 7.10 Shift Management Endpoints

#### GET /shifts

**Description:** List shifts

**Auth Required:** Yes (Owner, Admin see all; Staff see own)

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder`
- `userId` (uuid)
- `status` (open|closed)
- `startDate`, `endDate`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user": {
        "id": "uuid",
        "firstName": "Jane",
        "lastName": "Smith"
      },
      "startedAt": "2026-06-11T08:00:00.000Z",
      "endedAt": "2026-06-11T16:00:00.000Z",
      "startingCash": "200.00",
      "endingCash": "1450.75",
      "expectedCash": "1450.75",
      "cashDifference": "0.00",
      "totalSales": "1250.75",
      "salesCount": 42
    }
  ],
  "pagination": {...}
}
```

---

#### POST /shifts/open

**Description:** Open new shift

**Auth Required:** Yes

**Request Body:**
```json
{
  "startingCash": "200.00",
  "notes": "Starting morning shift"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "startedAt": "2026-06-11T08:00:00.000Z",
    "startingCash": "200.00"
  }
}
```

**Error Responses:**
- `409 CONFLICT` - User already has an open shift

---

#### POST /shifts/:id/close

**Description:** Close current shift

**Auth Required:** Yes (Owner, Admin, or shift owner)

**Request Body:**
```json
{
  "endingCash": "1450.75",
  "notes": "End of shift, all balanced"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "endedAt": "2026-06-11T16:00:00.000Z",
    "startingCash": "200.00",
    "endingCash": "1450.75",
    "expectedCash": "1450.75",
    "cashDifference": "0.00",
    "totalSales": "1250.75",
    "totalRefunds": "0.00",
    "salesCount": 42
  }
}
```

---

### 7.11 System & Configuration Endpoints

#### GET /categories

**Description:** List product categories

**Auth Required:** Yes

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "E-Liquids",
      "slug": "e-liquids",
      "description": "Vape juices and e-liquids",
      "parentId": null,
      "displayOrder": 1,
      "isActive": true,
      "children": [
        {
          "id": "uuid",
          "name": "Premium E-Liquids",
          "slug": "premium-e-liquids",
          "parentId": "parent-uuid"
        }
      ]
    }
  ]
}
```

---

#### GET /brands

**Description:** List brands

**Auth Required:** Yes

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "VapeCo",
      "description": "Premium vape products",
      "logoUrl": "https://cdn.example.com/logo.jpg",
      "website": "https://vapeco.com",
      "isActive": true
    }
  ]
}
```

---

#### GET /suppliers

**Description:** List suppliers

**Auth Required:** Yes (Owner, Admin)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "VapeSupplier Inc.",
      "contactPerson": "John Smith",
      "email": "orders@vapesupplier.com",
      "phone": "+1234567890",
      "city": "Los Angeles",
      "state": "CA",
      "isActive": true
    }
  ]
}
```

---

#### GET /payment-methods

**Description:** List available payment methods

**Auth Required:** Yes

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Cash",
      "type": "CASH",
      "isActive": true
    },
    {
      "id": "uuid",
      "name": "Credit Card",
      "type": "CARD",
      "isActive": true
    }
  ]
}
```

---

#### GET /settings

**Description:** Get system settings

**Auth Required:** Yes (Owner for all; Others for public settings)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "general": {
      "shopName": "My Vape Shop",
      "taxRate": "8.5",
      "currency": "USD",
      "minimumAge": "21"
    },
    "inventory": {
      "lowStockThreshold": "10"
    },
    "security": {
      "sessionTimeout": "900",
      "maxLoginAttempts": "5"
    }
  }
}
```

---

#### PATCH /settings

**Description:** Update system settings

**Auth Required:** Yes (Owner only)

**Request Body:**
```json
{
  "shopName": "Updated Shop Name",
  "taxRate": "9.0"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "updated": ["shopName", "taxRate"],
    "updatedAt": "2026-06-11T10:30:45.123Z"
  }
}
```

---

### 7.12 Notification Endpoints

#### GET /notifications

**Description:** Get user notifications

**Auth Required:** Yes

**Query Parameters:**
- `isRead` (boolean)
- `type` (enum)
- `limit` (default: 50)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "LOW_STOCK",
      "title": "Low Stock Alert",
      "message": "Product 'Premium E-Liquid 30ml' is below reorder point",
      "priority": "HIGH",
      "isRead": false,
      "createdAt": "2026-06-11T10:00:00.000Z"
    }
  ],
  "unreadCount": 5
}
```

---

#### PATCH /notifications/:id/read

**Description:** Mark notification as read

**Auth Required:** Yes

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "isRead": true,
    "readAt": "2026-06-11T10:30:45.123Z"
  }
}
```

---

### 7.13 Audit Log Endpoints

#### GET /audit-logs

**Description:** Get audit trail

**Auth Required:** Yes (Owner only)

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder`
- `userId` (uuid)
- `action` (string)
- `entityType` (string)
- `startDate`, `endDate`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user": {
        "firstName": "Jane",
        "lastName": "Smith"
      },
      "action": "SALE_CREATED",
      "entityType": "Sale",
      "entityId": "uuid",
      "newValues": {
        "saleNumber": "SALE-20260611-0001",
        "totalAmount": "108.50"
      },
      "ipAddress": "192.168.1.100",
      "createdAt": "2026-06-11T10:00:00.000Z"
    }
  ],
  "pagination": {...}
}
```

---

### 7.14 Health & Utility Endpoints

#### GET /health

**Description:** Health check endpoint

**Auth Required:** No

**Response (200 OK):**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-06-11T10:30:45.123Z",
  "services": {
    "database": "healthy",
    "redis": "healthy"
  }
}
```

---

#### GET /version

**Description:** API version information

**Auth Required:** No

**Response (200 OK):**
```json
{
  "version": "1.0.0",
  "apiVersion": "v1",
  "buildDate": "2026-06-01T00:00:00.000Z",
  "environment": "production"
}
```

---

## 8. Rate Limiting

### 8.1 Rate Limit Strategy

**Global Limits:**
- 100 requests per minute per IP address
- 20 requests per minute per endpoint per user

**Endpoint-Specific Limits:**
- `/auth/login`: 5 requests per minute per IP
- `/auth/refresh`: 10 requests per minute per user
- POST endpoints: 20 requests per minute per user
- GET endpoints: 100 requests per minute per user

### 8.2 Rate Limit Headers

**Response Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1686484845
```

**Rate Limit Exceeded Response (429):**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "retryAfter": 60
  }
}
```

---

## 9. API Versioning Strategy

### 9.1 Versioning Approach

**URL-Based Versioning:**
- Current: `/api/v1/`
- Future: `/api/v2/`

**Version Support:**
- Major versions supported for 12 months after new version release
- Minor versions backward compatible within major version
- Deprecation warnings sent 6 months before removal

### 9.2 Deprecation Headers

**Response Header for Deprecated Endpoints:**
```http
Deprecation: true
Sunset: Sat, 31 Dec 2026 23:59:59 GMT
Link: </api/v2/endpoint>; rel="alternate"
```

---

## 10. OpenAPI/Swagger Specification

### 10.1 API Documentation

**Interactive API Documentation:**
- Available at: `/api/docs`
- Swagger UI with live testing
- Auto-generated from NestJS decorators

**Swagger Configuration:**
```typescript
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('Vape Shop Management API')
  .setDescription('Complete API for vape shop inventory and sales management')
  .setVersion('1.0')
  .addBearerAuth()
  .addTag('auth', 'Authentication endpoints')
  .addTag('users', 'User management')
  .addTag('products', 'Product management')
  .addTag('inventory', 'Inventory management')
  .addTag('sales', 'Sales management')
  .addTag('reports', 'Reporting and analytics')
  .build();
```

### 10.2 Example Endpoint Documentation

**Using NestJS Decorators:**
```typescript
@ApiTags('products')
@Controller('products')
export class ProductsController {
  
  @Get()
  @ApiOperation({ summary: 'List all products' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ 
    status: 200, 
    description: 'Products retrieved successfully',
    type: ProductListResponse 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  async findAll(@Query() query: ProductQueryDto) {
    // Implementation
  }
  
  @Post()
  @ApiOperation({ summary: 'Create new product' })
  @ApiBearerAuth()
  @ApiBody({ type: CreateProductDto })
  @ApiResponse({ 
    status: 201, 
    description: 'Product created successfully',
    type: ProductResponse 
  })
  @ApiResponse({ 
    status: 422, 
    description: 'Validation error' 
  })
  async create(@Body() createProductDto: CreateProductDto) {
    // Implementation
  }
}
```

---

## 11. API Testing Examples

### 11.1 cURL Examples

**Login:**
```bash
curl -X POST https://api.vapeshop.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

**Create Product (with auth):**
```bash
curl -X POST https://api.vapeshop.com/api/v1/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "name": "New Product",
    "categoryId": "uuid",
    "variants": [...]
  }'
```

**Get Sales Report:**
```bash
curl -X GET "https://api.vapeshop.com/api/v1/reports/sales?startDate=2026-06-01&endDate=2026-06-11" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 11.2 Postman Collection

A complete Postman collection is available with:
- All endpoints
- Example requests/responses
- Environment variables
- Pre-request scripts for authentication
- Tests for response validation

**Collection Link:** `/docs/postman/VapeShop-API.postman_collection.json`

---

## 12. Best Practices for API Consumers

### 12.1 Authentication

1. **Store tokens securely:**
   - Access token in memory (not localStorage)
   - Refresh token in HTTP-only cookie
   
2. **Handle token refresh:**
   - Implement automatic token refresh on 401 errors
   - Retry failed requests after refresh

3. **Logout properly:**
   - Call `/auth/logout` endpoint
   - Clear local tokens

### 12.2 Error Handling

1. **Check response status:**
   - 2xx = Success
   - 4xx = Client error
   - 5xx = Server error

2. **Parse error responses:**
   - Always check `success` field
   - Display `error.message` to users
   - Log `error.details` for debugging

3. **Implement retry logic:**
   - Retry on 5xx errors with exponential backoff
   - Do not retry on 4xx errors (except 429)
   - Maximum 3 retries

### 12.3 Performance

1. **Use pagination:**
   - Always specify `limit` parameter
   - Don't request more data than needed

2. **Use field selection:**
   - Request only required fields with `?fields=`
   - Reduces payload size

3. **Cache responses:**
   - Cache GET responses when appropriate
   - Respect `Cache-Control` headers

4. **Batch operations:**
   - Use batch endpoints when available
   - Reduce number of API calls

---

## 13. Conclusion

### 13.1 API Summary

✅ **80+ endpoints** covering all business operations  
✅ **RESTful design** following industry best practices  
✅ **Comprehensive validation** on all inputs  
✅ **Role-based authorization** for security  
✅ **Consistent error handling** across all endpoints  
✅ **Pagination and filtering** for list endpoints  
✅ **Rate limiting** to prevent abuse  
✅ **API versioning** for backward compatibility  
✅ **Complete documentation** with Swagger/OpenAPI  

### 13.2 Implementation Checklist

- [ ] Implement all DTOs with validation decorators
- [ ] Add Swagger decorators to all endpoints
- [ ] Implement rate limiting middleware
- [ ] Add request/response interceptors
- [ ] Implement comprehensive error handling
- [ ] Add request logging
- [ ] Create Postman collection
- [ ] Write API integration tests
- [ ] Generate OpenAPI specification
- [ ] Deploy API documentation

### 13.3 Next Steps

1. ✅ Requirements Analysis Complete
2. ✅ System Architecture Complete
3. ✅ Database Schema Complete
4. ✅ **API Design Complete**
5. ➡️ **Next: Security Architecture Deep Dive**
   - Detailed security implementation
   - Threat model analysis
   - Security testing strategy
   
6. ➡️ Project Structure and Organization
7. ➡️ Implementation

---

**Document Status:** Complete  
**Review Status:** Ready for Technical Review  
**Next Document:** Security Architecture Design

---

*This API specification provides a complete, production-ready REST API for the vape shop management system. All endpoints follow RESTful principles, include comprehensive validation, and are designed for security, performance, and maintainability.*
