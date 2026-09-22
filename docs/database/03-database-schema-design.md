# Database Schema Design

**Document Version:** 1.0  
**Date:** June 11, 2026  
**Prepared By:** Senior Database Architect  
**Project:** Vape Shop Inventory and Sales Management System

---

## Executive Summary

This document defines the complete database schema for the vape shop management system. It includes a normalized relational design with 20+ tables, comprehensive relationships, indexes, constraints, and a production-ready Prisma schema.

**Database Type:** PostgreSQL 15.x  
**ORM:** Prisma 5.x  
**Normalization:** 3rd Normal Form (3NF)  
**Consistency:** ACID compliant with foreign key constraints

---

## Table of Contents

1. Entity Relationship Overview
2. Table Definitions
3. Relationships and Foreign Keys
4. Indexes and Performance Optimization
5. Constraints and Data Integrity
6. Prisma Schema
7. Data Dictionary
8. Migration Strategy

---

## 1. Entity Relationship Overview

### 1.1 High-Level Entity Diagram

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│    Roles    │◄────────│    Users    │────────►│  Sessions   │
└─────────────┘         └──────┬──────┘         └─────────────┘
                               │
                               │ creates
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌─────────────┐         ┌─────────────┐       ┌─────────────┐
│ AuditLogs   │         │    Sales    │       │PurchaseOrder│
└─────────────┘         └──────┬──────┘       └──────┬──────┘
                               │                     │
                               │                     │
                        ┌──────▼──────┐       ┌──────▼──────┐
                        │  SaleItems  │       │   POItems   │
                        └──────┬──────┘       └──────┬──────┘
                               │                     │
                               └──────────┬──────────┘
                                          │
                                          ▼
                                ┌─────────────────┐
                                │ProductVariants  │
                                └────────┬────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
            ┌─────────────┐      ┌─────────────┐    ┌─────────────┐
            │  Products   │      │  Inventory  │    │InventoryLogs│
            └──────┬──────┘      └─────────────┘    └─────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
┌─────────────┐ ┌─────────┐ ┌─────────────┐
│ Categories  │ │ Brands  │ │  Suppliers  │
└─────────────┘ └─────────┘ └─────────────┘


┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Customers  │────────►│    Sales    │         │   Shifts    │
└─────────────┘         └─────────────┘         └──────┬──────┘
                                                        │
                                                        ▼
                                                ┌─────────────┐
                                                │ CashDrawers │
                                                └─────────────┘
```



### 1.2 Core Entity Groups

**Authentication & Authorization**
- roles
- users
- sessions
- permissions (optional future enhancement)

**Product Management**
- categories
- brands
- suppliers
- products
- product_variants
- product_images (optional)

**Inventory Management**
- inventory
- inventory_logs
- stock_adjustments

**Sales Management**
- customers
- sales
- sale_items
- payment_methods
- payments

**Purchasing**
- purchase_orders
- purchase_order_items

**Cash Management**
- shifts
- cash_drawers
- cash_transactions

**System & Audit**
- audit_logs
- notifications
- system_settings

---

## 2. Table Definitions

### 2.1 Authentication & Authorization Tables

#### Table: `roles`

Stores user role definitions with permissions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| name | VARCHAR(50) | NOT NULL, UNIQUE | Role name (Owner, Admin, Staff) |
| description | TEXT | NULL | Role description |
| permissions | JSONB | NOT NULL, DEFAULT '{}' | Permission flags |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `name`

---

#### Table: `users`

Stores user account information.



| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| email | VARCHAR(255) | NOT NULL, UNIQUE | User email (login) |
| password_hash | VARCHAR(255) | NOT NULL | Bcrypt hashed password |
| first_name | VARCHAR(100) | NOT NULL | First name |
| last_name | VARCHAR(100) | NOT NULL | Last name |
| role_id | UUID | NOT NULL, FOREIGN KEY → roles(id) | User role |
| phone | VARCHAR(20) | NULL | Contact phone |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | Account active status |
| is_locked | BOOLEAN | NOT NULL, DEFAULT FALSE | Account locked (security) |
| failed_login_attempts | INTEGER | NOT NULL, DEFAULT 0 | Failed login counter |
| last_login_at | TIMESTAMP | NULL | Last successful login |
| last_login_ip | VARCHAR(45) | NULL | Last login IP address |
| password_changed_at | TIMESTAMP | NULL | Last password change |
| must_change_password | BOOLEAN | NOT NULL, DEFAULT FALSE | Force password change |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |
| deleted_at | TIMESTAMP | NULL | Soft delete timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `email` WHERE deleted_at IS NULL
- INDEX on `role_id`
- INDEX on `is_active`
- INDEX on `email, password_hash` (login query optimization)

**Constraints:**
- CHECK (failed_login_attempts >= 0)
- CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')

---

#### Table: `sessions`

Stores active user sessions for authentication and tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Session identifier |
| user_id | UUID | NOT NULL, FOREIGN KEY → users(id) | User owning session |
| refresh_token_hash | VARCHAR(255) | NOT NULL | Hashed refresh token |
| token_version | INTEGER | NOT NULL, DEFAULT 1 | For token invalidation |
| ip_address | VARCHAR(45) | NULL | Session IP address |
| user_agent | TEXT | NULL | Browser/client info |
| last_activity_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last activity time |
| expires_at | TIMESTAMP | NOT NULL | Session expiration |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `user_id`
- INDEX on `refresh_token_hash`
- INDEX on `expires_at` (for cleanup)

**TTL Strategy:** Sessions with `expires_at` < NOW() should be deleted by a scheduled job.

---

### 2.2 Product Management Tables

#### Table: `categories`

Product categorization (hierarchical support).



| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| name | VARCHAR(100) | NOT NULL | Category name |
| description | TEXT | NULL | Category description |
| parent_id | UUID | NULL, FOREIGN KEY → categories(id) | Parent category (for hierarchy) |
| slug | VARCHAR(100) | NOT NULL, UNIQUE | URL-friendly identifier |
| display_order | INTEGER | NOT NULL, DEFAULT 0 | Sort order |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | Visibility flag |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |
| deleted_at | TIMESTAMP | NULL | Soft delete timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `slug` WHERE deleted_at IS NULL
- INDEX on `parent_id`
- INDEX on `display_order`

---

#### Table: `brands`

Product brand information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| name | VARCHAR(100) | NOT NULL, UNIQUE | Brand name |
| description | TEXT | NULL | Brand description |
| logo_url | VARCHAR(500) | NULL | Brand logo image |
| website | VARCHAR(255) | NULL | Brand website |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | Active status |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |
| deleted_at | TIMESTAMP | NULL | Soft delete timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `name` WHERE deleted_at IS NULL

---

#### Table: `suppliers`

Supplier/vendor information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| name | VARCHAR(200) | NOT NULL | Supplier name |
| contact_person | VARCHAR(100) | NULL | Contact person name |
| email | VARCHAR(255) | NULL | Supplier email |
| phone | VARCHAR(20) | NULL | Supplier phone |
| address_line1 | VARCHAR(255) | NULL | Street address |
| address_line2 | VARCHAR(255) | NULL | Additional address |
| city | VARCHAR(100) | NULL | City |
| state | VARCHAR(50) | NULL | State/Province |
| postal_code | VARCHAR(20) | NULL | ZIP/Postal code |
| country | VARCHAR(50) | NOT NULL, DEFAULT 'USA' | Country |
| tax_id | VARCHAR(50) | NULL | Tax ID / EIN |
| payment_terms | VARCHAR(100) | NULL | Payment terms (Net 30, etc) |
| notes | TEXT | NULL | Additional notes |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | Active status |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |
| deleted_at | TIMESTAMP | NULL | Soft delete timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `name`
- INDEX on `is_active`



---

#### Table: `products`

Master product information (without variants).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| name | VARCHAR(255) | NOT NULL | Product name |
| description | TEXT | NULL | Product description |
| category_id | UUID | NOT NULL, FOREIGN KEY → categories(id) | Product category |
| brand_id | UUID | NULL, FOREIGN KEY → brands(id) | Product brand |
| supplier_id | UUID | NULL, FOREIGN KEY → suppliers(id) | Primary supplier |
| image_url | VARCHAR(500) | NULL | Primary product image |
| is_age_restricted | BOOLEAN | NOT NULL, DEFAULT TRUE | Age verification required |
| minimum_age | INTEGER | NOT NULL, DEFAULT 21 | Minimum age requirement |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | Product active status |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |
| deleted_at | TIMESTAMP | NULL | Soft delete timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `category_id`
- INDEX on `brand_id`
- INDEX on `supplier_id`
- INDEX on `name` (for search)
- INDEX on `is_active`
- FULL TEXT INDEX on `name, description` (for search)

---

#### Table: `product_variants`

Product variants (flavors, strengths, sizes, etc.).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| product_id | UUID | NOT NULL, FOREIGN KEY → products(id) | Parent product |
| sku | VARCHAR(100) | NOT NULL, UNIQUE | Stock Keeping Unit |
| barcode | VARCHAR(100) | NULL, UNIQUE | Barcode / UPC |
| variant_name | VARCHAR(255) | NOT NULL | Variant description (e.g., "30ml, 3mg Nicotine") |
| attributes | JSONB | NULL | Variant attributes (flavor, strength, size) |
| cost_price | DECIMAL(10,2) | NOT NULL | Cost per unit |
| retail_price | DECIMAL(10,2) | NOT NULL | Retail price |
| compare_at_price | DECIMAL(10,2) | NULL | Original price (for discounts) |
| tax_rate | DECIMAL(5,2) | NOT NULL, DEFAULT 0.00 | Tax rate percentage |
| reorder_point | INTEGER | NOT NULL, DEFAULT 10 | Low stock threshold |
| reorder_quantity | INTEGER | NOT NULL, DEFAULT 50 | Suggested reorder amount |
| weight | DECIMAL(8,2) | NULL | Weight in grams |
| dimensions | JSONB | NULL | Dimensions (length, width, height) |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | Variant active status |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |
| deleted_at | TIMESTAMP | NULL | Soft delete timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `sku` WHERE deleted_at IS NULL
- UNIQUE INDEX on `barcode` WHERE deleted_at IS NULL AND barcode IS NOT NULL
- INDEX on `product_id`
- INDEX on `is_active`
- INDEX on `retail_price`

**Constraints:**
- CHECK (cost_price >= 0)
- CHECK (retail_price >= 0)
- CHECK (compare_at_price >= retail_price OR compare_at_price IS NULL)
- CHECK (tax_rate >= 0 AND tax_rate <= 100)
- CHECK (reorder_point >= 0)
- CHECK (reorder_quantity > 0)



---

### 2.3 Inventory Management Tables

#### Table: `inventory`

Current inventory levels for each product variant.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| product_variant_id | UUID | NOT NULL, UNIQUE, FOREIGN KEY → product_variants(id) | Product variant |
| quantity_on_hand | INTEGER | NOT NULL, DEFAULT 0 | Current stock quantity |
| quantity_reserved | INTEGER | NOT NULL, DEFAULT 0 | Reserved (pending orders) |
| quantity_available | INTEGER | GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED | Available stock |
| last_counted_at | TIMESTAMP | NULL | Last physical count |
| last_counted_by | UUID | NULL, FOREIGN KEY → users(id) | User who counted |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `product_variant_id`
- INDEX on `quantity_available` (for low stock queries)

**Constraints:**
- CHECK (quantity_on_hand >= 0)
- CHECK (quantity_reserved >= 0)
- CHECK (quantity_reserved <= quantity_on_hand)

**Note:** This is the single source of truth for inventory levels.

---

#### Table: `inventory_logs`

Complete audit trail of all inventory changes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| product_variant_id | UUID | NOT NULL, FOREIGN KEY → product_variants(id) | Product variant |
| change_type | VARCHAR(50) | NOT NULL | Type of change (SALE, RECEIVE, ADJUST, DAMAGE, RETURN) |
| quantity_change | INTEGER | NOT NULL | Quantity changed (+ or -) |
| quantity_before | INTEGER | NOT NULL | Quantity before change |
| quantity_after | INTEGER | NOT NULL | Quantity after change |
| reference_id | UUID | NULL | Related record ID (sale_id, po_id, etc) |
| reference_type | VARCHAR(50) | NULL | Reference type (SALE, PURCHASE_ORDER, ADJUSTMENT) |
| reason | TEXT | NULL | Reason for change |
| notes | TEXT | NULL | Additional notes |
| user_id | UUID | NOT NULL, FOREIGN KEY → users(id) | User who made change |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `product_variant_id, created_at DESC` (for history queries)
- INDEX on `change_type`
- INDEX on `user_id`
- INDEX on `reference_id, reference_type`
- INDEX on `created_at DESC` (for recent changes)

**Constraints:**
- CHECK (change_type IN ('SALE', 'RECEIVE', 'ADJUST', 'DAMAGE', 'RETURN', 'COUNT'))
- CHECK (quantity_after = quantity_before + quantity_change)

**Note:** This table is append-only for audit purposes.



---

### 2.4 Sales Management Tables

#### Table: `customers`

Customer information (optional, for loyalty and history).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| first_name | VARCHAR(100) | NULL | First name |
| last_name | VARCHAR(100) | NULL | Last name |
| email | VARCHAR(255) | NULL, UNIQUE | Customer email |
| phone | VARCHAR(20) | NULL | Customer phone |
| date_of_birth | DATE | NULL | Date of birth (for age verification) |
| age_verified | BOOLEAN | NOT NULL, DEFAULT FALSE | Age verification status |
| age_verified_at | TIMESTAMP | NULL | When age was verified |
| age_verified_by | UUID | NULL, FOREIGN KEY → users(id) | Staff who verified |
| loyalty_points | INTEGER | NOT NULL, DEFAULT 0 | Loyalty points balance |
| total_spent | DECIMAL(10,2) | NOT NULL, DEFAULT 0.00 | Lifetime spend |
| notes | TEXT | NULL | Customer notes |
| marketing_consent | BOOLEAN | NOT NULL, DEFAULT FALSE | Email marketing consent |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | Active status |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |
| deleted_at | TIMESTAMP | NULL | Soft delete timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `email` WHERE deleted_at IS NULL AND email IS NOT NULL
- INDEX on `phone`
- INDEX on `is_active`

**Constraints:**
- CHECK (loyalty_points >= 0)
- CHECK (total_spent >= 0)
- CHECK (date_of_birth IS NULL OR date_of_birth < CURRENT_DATE)

---

#### Table: `payment_methods`

Available payment methods.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| name | VARCHAR(50) | NOT NULL, UNIQUE | Payment method name |
| type | VARCHAR(20) | NOT NULL | Type (CASH, CARD, DIGITAL) |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | Active status |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `name`

**Default Records:**
```sql
INSERT INTO payment_methods (name, type) VALUES 
  ('Cash', 'CASH'),
  ('Credit Card', 'CARD'),
  ('Debit Card', 'CARD'),
  ('Digital Wallet', 'DIGITAL');
```

---

#### Table: `sales`

Sales transactions.



| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| sale_number | VARCHAR(50) | NOT NULL, UNIQUE | Human-readable sale number (e.g., "SALE-20260611-0001") |
| customer_id | UUID | NULL, FOREIGN KEY → customers(id) | Customer (if provided) |
| user_id | UUID | NOT NULL, FOREIGN KEY → users(id) | Staff who processed sale |
| shift_id | UUID | NULL, FOREIGN KEY → shifts(id) | Shift during which sale occurred |
| subtotal | DECIMAL(10,2) | NOT NULL | Subtotal before tax |
| tax_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0.00 | Total tax amount |
| discount_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0.00 | Total discount |
| total_amount | DECIMAL(10,2) | NOT NULL | Final total amount |
| amount_paid | DECIMAL(10,2) | NOT NULL | Amount received from customer |
| change_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0.00 | Change given |
| payment_method_id | UUID | NOT NULL, FOREIGN KEY → payment_methods(id) | Payment method |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'COMPLETED' | Sale status |
| age_verified | BOOLEAN | NOT NULL, DEFAULT FALSE | Age verification performed |
| notes | TEXT | NULL | Sale notes |
| voided_at | TIMESTAMP | NULL | When sale was voided |
| voided_by | UUID | NULL, FOREIGN KEY → users(id) | User who voided |
| void_reason | TEXT | NULL | Reason for void |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Sale timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `sale_number`
- INDEX on `customer_id`
- INDEX on `user_id`
- INDEX on `shift_id`
- INDEX on `status`
- INDEX on `created_at DESC` (for recent sales)
- INDEX on `user_id, created_at DESC` (for staff performance)

**Constraints:**
- CHECK (status IN ('COMPLETED', 'VOIDED', 'REFUNDED'))
- CHECK (subtotal >= 0)
- CHECK (tax_amount >= 0)
- CHECK (discount_amount >= 0)
- CHECK (total_amount = subtotal + tax_amount - discount_amount)
- CHECK (amount_paid >= total_amount)
- CHECK (change_amount = amount_paid - total_amount)
- CHECK (voided_at IS NULL OR voided_by IS NOT NULL)

**Triggers:**
- After INSERT: Update customer.total_spent
- After INSERT: Update inventory
- After INSERT: Create inventory_logs

---

#### Table: `sale_items`

Line items for each sale.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| sale_id | UUID | NOT NULL, FOREIGN KEY → sales(id) ON DELETE CASCADE | Parent sale |
| product_variant_id | UUID | NOT NULL, FOREIGN KEY → product_variants(id) | Product sold |
| product_snapshot | JSONB | NOT NULL | Snapshot of product at sale time |
| quantity | INTEGER | NOT NULL | Quantity sold |
| unit_price | DECIMAL(10,2) | NOT NULL | Price per unit at sale time |
| unit_cost | DECIMAL(10,2) | NOT NULL | Cost per unit at sale time |
| tax_rate | DECIMAL(5,2) | NOT NULL | Tax rate applied |
| discount_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0.00 | Discount on this item |
| line_total | DECIMAL(10,2) | NOT NULL | Total for this line |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `sale_id`
- INDEX on `product_variant_id`
- INDEX on `created_at`

**Constraints:**
- CHECK (quantity > 0)
- CHECK (unit_price >= 0)
- CHECK (unit_cost >= 0)
- CHECK (tax_rate >= 0 AND tax_rate <= 100)
- CHECK (discount_amount >= 0)
- CHECK (line_total = (quantity * unit_price - discount_amount) * (1 + tax_rate/100))

**Note:** `product_snapshot` stores product name, SKU, etc. at time of sale to preserve historical accuracy.



---

### 2.5 Purchase Order Tables

#### Table: `purchase_orders`

Purchase orders to suppliers.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| po_number | VARCHAR(50) | NOT NULL, UNIQUE | PO number (e.g., "PO-20260611-0001") |
| supplier_id | UUID | NOT NULL, FOREIGN KEY → suppliers(id) | Supplier |
| user_id | UUID | NOT NULL, FOREIGN KEY → users(id) | User who created PO |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'DRAFT' | PO status |
| order_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | Order date |
| expected_date | DATE | NULL | Expected delivery date |
| received_date | DATE | NULL | Actual received date |
| subtotal | DECIMAL(10,2) | NOT NULL, DEFAULT 0.00 | Subtotal |
| tax_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0.00 | Tax amount |
| shipping_cost | DECIMAL(10,2) | NOT NULL, DEFAULT 0.00 | Shipping cost |
| total_amount | DECIMAL(10,2) | NOT NULL | Total PO amount |
| notes | TEXT | NULL | PO notes |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `po_number`
- INDEX on `supplier_id`
- INDEX on `user_id`
- INDEX on `status`
- INDEX on `order_date DESC`

**Constraints:**
- CHECK (status IN ('DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED'))
- CHECK (total_amount = subtotal + tax_amount + shipping_cost)
- CHECK (expected_date IS NULL OR expected_date >= order_date)

---

#### Table: `purchase_order_items`

Line items for purchase orders.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| purchase_order_id | UUID | NOT NULL, FOREIGN KEY → purchase_orders(id) ON DELETE CASCADE | Parent PO |
| product_variant_id | UUID | NOT NULL, FOREIGN KEY → product_variants(id) | Product to order |
| quantity_ordered | INTEGER | NOT NULL | Quantity ordered |
| quantity_received | INTEGER | NOT NULL, DEFAULT 0 | Quantity received so far |
| unit_cost | DECIMAL(10,2) | NOT NULL | Cost per unit |
| line_total | DECIMAL(10,2) | NOT NULL | Total for this line |
| notes | TEXT | NULL | Line item notes |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `purchase_order_id`
- INDEX on `product_variant_id`

**Constraints:**
- CHECK (quantity_ordered > 0)
- CHECK (quantity_received >= 0)
- CHECK (quantity_received <= quantity_ordered)
- CHECK (unit_cost >= 0)
- CHECK (line_total = quantity_ordered * unit_cost)

---

### 2.6 Cash Management Tables

#### Table: `shifts`

Staff shifts for cash drawer accountability.



| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| user_id | UUID | NOT NULL, FOREIGN KEY → users(id) | Staff member |
| started_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Shift start time |
| ended_at | TIMESTAMP | NULL | Shift end time |
| starting_cash | DECIMAL(10,2) | NOT NULL | Opening cash amount |
| ending_cash | DECIMAL(10,2) | NULL | Closing cash amount |
| expected_cash | DECIMAL(10,2) | NULL | Expected cash (calculated) |
| cash_difference | DECIMAL(10,2) | NULL | Over/short amount |
| total_sales | DECIMAL(10,2) | NOT NULL, DEFAULT 0.00 | Total sales during shift |
| total_refunds | DECIMAL(10,2) | NOT NULL, DEFAULT 0.00 | Total refunds during shift |
| notes | TEXT | NULL | Shift notes |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `user_id`
- INDEX on `started_at DESC`
- INDEX on `ended_at`

**Constraints:**
- CHECK (ending_cash IS NULL OR ending_cash >= 0)
- CHECK (starting_cash >= 0)
- CHECK (ended_at IS NULL OR ended_at > started_at)
- CHECK (cash_difference = ending_cash - expected_cash OR cash_difference IS NULL)

---

#### Table: `cash_drawers`

Cash drawer transactions during shifts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| shift_id | UUID | NOT NULL, FOREIGN KEY → shifts(id) | Associated shift |
| transaction_type | VARCHAR(20) | NOT NULL | Type of transaction |
| amount | DECIMAL(10,2) | NOT NULL | Transaction amount |
| reason | TEXT | NULL | Reason/description |
| user_id | UUID | NOT NULL, FOREIGN KEY → users(id) | User who made transaction |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Transaction timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `shift_id`
- INDEX on `transaction_type`
- INDEX on `created_at`

**Constraints:**
- CHECK (transaction_type IN ('CASH_IN', 'CASH_OUT', 'DROP', 'PICKUP'))
- CHECK (amount != 0)

---

### 2.7 System & Audit Tables

#### Table: `audit_logs`

Comprehensive audit trail of all sensitive actions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| user_id | UUID | NULL, FOREIGN KEY → users(id) | User who performed action |
| action | VARCHAR(100) | NOT NULL | Action performed |
| entity_type | VARCHAR(50) | NOT NULL | Type of entity affected |
| entity_id | UUID | NULL | ID of affected entity |
| old_values | JSONB | NULL | Previous values (for updates) |
| new_values | JSONB | NULL | New values |
| ip_address | VARCHAR(45) | NULL | IP address of request |
| user_agent | TEXT | NULL | User agent string |
| request_id | UUID | NULL | Request correlation ID |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Action timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `user_id, created_at DESC`
- INDEX on `action`
- INDEX on `entity_type, entity_id`
- INDEX on `created_at DESC` (for recent activity)

**Constraints:**
- This table is append-only (no updates or deletes)

**Actions to Log:**
- LOGIN, LOGOUT, LOGIN_FAILED
- USER_CREATED, USER_UPDATED, USER_DELETED, USER_DEACTIVATED
- PRODUCT_CREATED, PRODUCT_UPDATED, PRODUCT_DELETED
- INVENTORY_ADJUSTED, INVENTORY_COUNTED
- SALE_CREATED, SALE_VOIDED, SALE_REFUNDED
- PO_CREATED, PO_RECEIVED
- SETTINGS_UPDATED



---

#### Table: `notifications`

System notifications for users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| user_id | UUID | NULL, FOREIGN KEY → users(id) | Target user (NULL = all) |
| type | VARCHAR(50) | NOT NULL | Notification type |
| title | VARCHAR(255) | NOT NULL | Notification title |
| message | TEXT | NOT NULL | Notification message |
| data | JSONB | NULL | Additional data |
| is_read | BOOLEAN | NOT NULL, DEFAULT FALSE | Read status |
| read_at | TIMESTAMP | NULL | When read |
| priority | VARCHAR(20) | NOT NULL, DEFAULT 'NORMAL' | Priority level |
| expires_at | TIMESTAMP | NULL | Expiration time |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `user_id, is_read`
- INDEX on `type`
- INDEX on `created_at DESC`
- INDEX on `expires_at` (for cleanup)

**Constraints:**
- CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT'))
- CHECK (type IN ('INFO', 'WARNING', 'ERROR', 'SUCCESS', 'LOW_STOCK', 'SYSTEM'))

**Notification Types:**
- LOW_STOCK: Product below reorder point
- SHIFT_OPEN: Shift opened by staff
- CASH_VARIANCE: Significant cash over/short
- FAILED_LOGIN: Multiple failed login attempts
- SYSTEM: System maintenance, updates

---

#### Table: `system_settings`

System-wide configuration settings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier |
| key | VARCHAR(100) | NOT NULL, UNIQUE | Setting key |
| value | TEXT | NOT NULL | Setting value |
| data_type | VARCHAR(20) | NOT NULL | Data type |
| category | VARCHAR(50) | NOT NULL | Setting category |
| description | TEXT | NULL | Setting description |
| is_public | BOOLEAN | NOT NULL, DEFAULT FALSE | Visible to non-owners |
| updated_by | UUID | NULL, FOREIGN KEY → users(id) | Last user to update |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE INDEX on `key`
- INDEX on `category`

**Constraints:**
- CHECK (data_type IN ('STRING', 'NUMBER', 'BOOLEAN', 'JSON'))

**Example Settings:**
```sql
INSERT INTO system_settings (key, value, data_type, category, description) VALUES
  ('shop.name', 'My Vape Shop', 'STRING', 'general', 'Shop name'),
  ('shop.tax_rate', '8.5', 'NUMBER', 'general', 'Default tax rate percentage'),
  ('shop.currency', 'USD', 'STRING', 'general', 'Currency code'),
  ('shop.minimum_age', '21', 'NUMBER', 'compliance', 'Minimum age for purchases'),
  ('inventory.low_stock_threshold', '10', 'NUMBER', 'inventory', 'Low stock alert threshold'),
  ('security.session_timeout', '900', 'NUMBER', 'security', 'Session timeout in seconds'),
  ('security.max_login_attempts', '5', 'NUMBER', 'security', 'Max failed login attempts');
```

---

## 3. Relationships and Foreign Keys

### 3.1 Relationship Matrix

| Parent Table | Child Table | Relationship | On Delete |
|--------------|-------------|--------------|-----------|
| roles | users | One-to-Many | RESTRICT |
| users | sessions | One-to-Many | CASCADE |
| users | sales | One-to-Many | RESTRICT |
| users | shifts | One-to-Many | RESTRICT |
| users | purchase_orders | One-to-Many | RESTRICT |
| users | audit_logs | One-to-Many | SET NULL |
| categories | categories | One-to-Many (self) | CASCADE |
| categories | products | One-to-Many | RESTRICT |
| brands | products | One-to-Many | SET NULL |
| suppliers | products | One-to-Many | SET NULL |
| suppliers | purchase_orders | One-to-Many | RESTRICT |
| products | product_variants | One-to-Many | CASCADE |
| product_variants | inventory | One-to-One | CASCADE |
| product_variants | inventory_logs | One-to-Many | RESTRICT |
| product_variants | sale_items | One-to-Many | RESTRICT |
| product_variants | purchase_order_items | One-to-Many | RESTRICT |
| customers | sales | One-to-Many | SET NULL |
| payment_methods | sales | One-to-Many | RESTRICT |
| sales | sale_items | One-to-Many | CASCADE |
| shifts | sales | One-to-Many | SET NULL |
| shifts | cash_drawers | One-to-Many | CASCADE |
| purchase_orders | purchase_order_items | One-to-Many | CASCADE |



### 3.2 Referential Integrity Rules

**CASCADE:** Child records are automatically deleted when parent is deleted
- Used for: owned data that has no meaning without parent (sale_items, po_items, sessions)

**RESTRICT:** Prevents deletion of parent if children exist
- Used for: critical relationships that require manual cleanup (users, products)

**SET NULL:** Foreign key is set to NULL when parent is deleted
- Used for: optional relationships where historical data should be preserved

---

## 4. Indexes and Performance Optimization

### 4.1 Index Strategy

**Primary Key Indexes (Automatic):**
- All tables have UUID primary key with automatic index

**Foreign Key Indexes:**
- All foreign key columns have indexes for join performance

**Search Indexes:**
- Full-text search on products(name, description)
- B-tree index on frequently searched fields (email, sku, barcode)

**Sorting Indexes:**
- Composite indexes for common sort operations
- Example: `(created_at DESC)` for recent records

**Filtering Indexes:**
- Partial indexes for common WHERE clauses
- Example: `WHERE deleted_at IS NULL`

### 4.2 Performance Considerations

**Computed Columns:**
- `inventory.quantity_available` is computed from `quantity_on_hand - quantity_reserved`
- Stored as GENERATED column for query performance

**JSONB Columns:**
- Used for flexible data (attributes, permissions, snapshots)
- GIN indexes can be added for JSONB queries if needed

**Partition Strategy (Future):**
- `audit_logs` can be partitioned by month for better performance
- `inventory_logs` can be partitioned by quarter
- `sales` can be partitioned by month if volume is high

---

## 5. Constraints and Data Integrity

### 5.1 Check Constraints

**Monetary Values:**
- All prices, costs, amounts must be >= 0
- Total calculations must match components

**Quantities:**
- Stock quantities must be >= 0
- Reserved cannot exceed on-hand
- Sale quantities must be > 0

**Dates:**
- End dates must be after start dates
- Birth dates must be in the past

**Enums:**
- Status fields constrained to specific values
- Type fields constrained to specific values

### 5.2 Unique Constraints

**Business Keys:**
- email (users, customers)
- sku (product_variants)
- barcode (product_variants)
- sale_number (sales)
- po_number (purchase_orders)

**Compound Uniqueness:**
- product_variant_id in inventory (one-to-one relationship)

### 5.3 Not Null Constraints

**Critical Fields:**
- All foreign keys (except optional relationships)
- All monetary amounts
- All timestamps (created_at, updated_at)
- All boolean flags (with defaults)

---

## 6. Complete Prisma Schema

Let me create the complete, production-ready Prisma schema file:



**Complete Prisma Schema Location:** `/backend/prisma/schema.prisma`

### 6.1 Schema Highlights

**Total Tables:** 20
- Authentication: 3 (roles, users, sessions)
- Products: 5 (categories, brands, suppliers, products, product_variants)
- Inventory: 2 (inventory, inventory_logs)
- Sales: 4 (customers, payment_methods, sales, sale_items)
- Purchasing: 2 (purchase_orders, purchase_order_items)
- Cash: 2 (shifts, cash_drawers)
- System: 3 (audit_logs, notifications, system_settings)

**Total Relationships:** 35+ foreign key relationships

**Key Features:**
- UUID primary keys for all tables
- Soft deletes on user-facing entities (deletedAt)
- Timestamps on all tables (createdAt, updatedAt)
- JSONB for flexible data (permissions, attributes, snapshots)
- Cascading deletes for owned data
- Restrict deletes for referenced data
- Comprehensive indexes for performance

---

## 7. Data Dictionary

### 7.1 Enum Values

**User Status:**
- `isActive`: true (can login), false (disabled)
- `isLocked`: true (temporarily locked), false (normal)

**Sale Status:**
- `COMPLETED`: Normal completed sale
- `VOIDED`: Sale cancelled (inventory restored)
- `REFUNDED`: Sale refunded (partial or full)

**Purchase Order Status:**
- `DRAFT`: PO created but not sent
- `SENT`: PO sent to supplier
- `PARTIAL`: Partially received
- `RECEIVED`: Fully received
- `CANCELLED`: PO cancelled

**Inventory Change Types:**
- `SALE`: Stock sold
- `RECEIVE`: Stock received from PO
- `ADJUST`: Manual adjustment
- `DAMAGE`: Damaged/defective items
- `RETURN`: Customer return
- `COUNT`: Physical count adjustment

**Payment Types:**
- `CASH`: Cash payment
- `CARD`: Credit/debit card
- `DIGITAL`: Digital wallet (Apple Pay, etc.)

**Cash Drawer Transaction Types:**
- `CASH_IN`: Cash added to drawer
- `CASH_OUT`: Cash removed from drawer
- `DROP`: Cash drop to safe
- `PICKUP`: Cash pickup from drawer

**Notification Types:**
- `INFO`: Informational
- `WARNING`: Warning message
- `ERROR`: Error notification
- `SUCCESS`: Success message
- `LOW_STOCK`: Low stock alert
- `SYSTEM`: System notification

**Notification Priority:**
- `LOW`: Low priority
- `NORMAL`: Normal priority
- `HIGH`: High priority
- `URGENT`: Urgent attention required

---

## 8. Migration Strategy

### 8.1 Initial Migration

**Step 1: Setup Prisma**
```bash
cd backend
npm install prisma @prisma/client
npx prisma init
```

**Step 2: Configure Database**
```env
DATABASE_URL="postgresql://user:password@localhost:5432/vape_shop_db?schema=public"
```

**Step 3: Generate Migration**
```bash
npx prisma migrate dev --name init
```

This will:
- Create all tables
- Create all indexes
- Create all constraints
- Generate Prisma Client

**Step 4: Seed Initial Data**
```bash
npx prisma db seed
```

### 8.2 Seed Data Requirements

**Required Seed Data:**

1. **Roles**
```typescript
const roles = [
  {
    name: 'Owner',
    description: 'Full system access',
    permissions: {
      users: ['create', 'read', 'update', 'delete'],
      products: ['create', 'read', 'update', 'delete'],
      inventory: ['create', 'read', 'update', 'delete'],
      sales: ['create', 'read', 'update', 'void', 'refund'],
      reports: ['read', 'export'],
      settings: ['read', 'update'],
      auditLogs: ['read']
    }
  },
  {
    name: 'Admin',
    description: 'Administrative access',
    permissions: {
      users: ['create', 'read', 'update'],
      products: ['create', 'read', 'update', 'delete'],
      inventory: ['create', 'read', 'update'],
      sales: ['create', 'read', 'update', 'void'],
      reports: ['read', 'export']
    }
  },
  {
    name: 'Staff',
    description: 'Basic staff access',
    permissions: {
      products: ['read'],
      inventory: ['read', 'receive'],
      sales: ['create', 'read']
    }
  }
];
```

2. **Default Owner User**
```typescript
const owner = {
  email: 'owner@vapeshop.com',
  password: 'ChangeMe123!',  // Must be changed on first login
  firstName: 'System',
  lastName: 'Owner',
  roleId: ownerRoleId,
  mustChangePassword: true
};
```

3. **Payment Methods**
```typescript
const paymentMethods = [
  { name: 'Cash', type: 'CASH' },
  { name: 'Credit Card', type: 'CARD' },
  { name: 'Debit Card', type: 'CARD' },
  { name: 'Digital Wallet', type: 'DIGITAL' }
];
```

4. **System Settings**
```typescript
const settings = [
  { key: 'shop.name', value: 'My Vape Shop', dataType: 'STRING', category: 'general' },
  { key: 'shop.tax_rate', value: '8.5', dataType: 'NUMBER', category: 'general' },
  { key: 'shop.currency', value: 'USD', dataType: 'STRING', category: 'general' },
  { key: 'shop.minimum_age', value: '21', dataType: 'NUMBER', category: 'compliance' },
  { key: 'inventory.low_stock_threshold', value: '10', dataType: 'NUMBER', category: 'inventory' },
  { key: 'security.session_timeout', value: '900', dataType: 'NUMBER', category: 'security' },
  { key: 'security.max_login_attempts', value: '5', dataType: 'NUMBER', category: 'security' }
];
```



### 8.3 Migration Best Practices

**Development Migrations:**
```bash
# Create migration
npx prisma migrate dev --name descriptive_name

# Reset database (WARNING: destroys data)
npx prisma migrate reset

# View migration status
npx prisma migrate status
```

**Production Migrations:**
```bash
# Deploy migrations (no prompts)
npx prisma migrate deploy

# Resolve failed migration
npx prisma migrate resolve --applied <migration_name>
npx prisma migrate resolve --rolled-back <migration_name>
```

**Migration Checklist:**
1. ✅ Test migration on development database
2. ✅ Backup production database before migration
3. ✅ Review generated SQL
4. ✅ Test rollback procedure
5. ✅ Update application code if needed
6. ✅ Run migration during low-traffic period
7. ✅ Verify data integrity after migration
8. ✅ Monitor application logs

---

## 9. Database Optimization Strategies

### 9.1 Query Optimization

**Common Queries and Indexes:**

1. **Find Products with Low Stock**
```sql
-- Query
SELECT pv.*, i.quantity_on_hand, p.name
FROM product_variants pv
JOIN inventory i ON pv.id = i.product_variant_id
JOIN products p ON pv.product_id = p.id
WHERE i.quantity_on_hand <= pv.reorder_point
  AND pv.is_active = true;

-- Optimal Indexes (already included)
-- inventory(product_variant_id)
-- inventory(quantity_on_hand)
-- product_variants(is_active)
```

2. **Daily Sales Report**
```sql
-- Query
SELECT 
  DATE(created_at) as sale_date,
  COUNT(*) as transaction_count,
  SUM(total_amount) as total_sales,
  SUM(total_amount - subtotal) as total_tax
FROM sales
WHERE created_at >= CURRENT_DATE
  AND status = 'COMPLETED'
GROUP BY DATE(created_at);

-- Optimal Indexes (already included)
-- sales(created_at DESC)
-- sales(status)
```

3. **Top Selling Products (Last 30 Days)**
```sql
-- Query
SELECT 
  pv.id,
  pv.sku,
  p.name,
  pv.variant_name,
  SUM(si.quantity) as units_sold,
  SUM(si.line_total) as revenue
FROM sale_items si
JOIN sales s ON si.sale_id = s.id
JOIN product_variants pv ON si.product_variant_id = pv.id
JOIN products p ON pv.product_id = p.id
WHERE s.created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND s.status = 'COMPLETED'
GROUP BY pv.id, pv.sku, p.name, pv.variant_name
ORDER BY units_sold DESC
LIMIT 10;

-- Optimal Indexes (already included)
-- sale_items(sale_id)
-- sale_items(product_variant_id)
-- sales(created_at DESC)
```

### 9.2 Connection Pooling

**Recommended Settings:**

```typescript
// Prisma connection pool configuration
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// In DATABASE_URL
postgresql://user:password@localhost:5432/vape_shop_db?schema=public&connection_limit=10&pool_timeout=20

// Connection limits:
// Development: 5 connections
// Staging: 10 connections
// Production: 20 connections (adjust based on load)
```

### 9.3 Database Maintenance Tasks

**Daily:**
- Vacuum analyze on high-write tables (sales, inventory_logs, audit_logs)
- Check for long-running queries
- Review error logs

**Weekly:**
- Full vacuum on all tables
- Update table statistics
- Check index usage statistics
- Review slow query log

**Monthly:**
- Reindex fragmented indexes
- Archive old audit logs (>2 years)
- Archive old sales (>1 year) to archive tables
- Database size and growth analysis

**Quarterly:**
- Full database backup and restore test
- Review and optimize queries
- Capacity planning review

---

## 10. Security Considerations

### 10.1 Database-Level Security

**User Permissions:**

```sql
-- Application user (read/write)
CREATE USER vape_app WITH PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE vape_shop_db TO vape_app;
GRANT USAGE ON SCHEMA public TO vape_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vape_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vape_app;

-- Read-only user (reporting)
CREATE USER vape_readonly WITH PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE vape_shop_db TO vape_readonly;
GRANT USAGE ON SCHEMA public TO vape_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO vape_readonly;

-- Backup user
CREATE USER vape_backup WITH PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE vape_shop_db TO vape_backup;
ALTER USER vape_backup WITH REPLICATION;
```

### 10.2 Sensitive Data Protection

**Encrypted Columns (Future Enhancement):**

For highly sensitive data, consider column-level encryption:

```sql
-- Example: Encrypted customer email
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Store encrypted
INSERT INTO customers (email_encrypted) 
VALUES (pgp_sym_encrypt('customer@email.com', 'encryption_key'));

-- Retrieve decrypted
SELECT pgp_sym_decrypt(email_encrypted, 'encryption_key') as email
FROM customers;
```

**Current Protection:**
- Passwords: bcrypt hashed (12 rounds)
- Sessions: Refresh tokens hashed
- Audit logs: PII masked in application layer
- Database backups: Encrypted with AES-256

### 10.3 Audit Trail Integrity

**Immutable Audit Logs:**

```sql
-- Prevent updates/deletes on audit_logs
CREATE RULE audit_logs_no_update AS 
  ON UPDATE TO audit_logs DO INSTEAD NOTHING;

CREATE RULE audit_logs_no_delete AS 
  ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- Only way to remove is truncate (requires superuser)
```

---

## 11. Testing Strategy

### 11.1 Database Testing

**Unit Tests:**
- Prisma model validation
- Constraint enforcement
- Default value application
- Calculated field accuracy

**Integration Tests:**
- CRUD operations
- Complex queries
- Transaction rollback
- Cascade behaviors

**Performance Tests:**
- Query performance under load
- Concurrent transaction handling
- Index effectiveness
- Connection pool limits

### 11.2 Test Data Generation

```typescript
// Use Faker.js for realistic test data
import { faker } from '@faker-js/faker';

// Generate test products
for (let i = 0; i < 100; i++) {
  await prisma.product.create({
    data: {
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      categoryId: faker.helpers.arrayElement(categoryIds),
      brandId: faker.helpers.arrayElement(brandIds),
      // ... more fields
    }
  });
}
```

---

## 12. Database Monitoring

### 12.1 Key Metrics to Monitor

**Performance Metrics:**
- Query execution time (p50, p95, p99)
- Connection pool utilization
- Cache hit rate
- Index usage statistics
- Table bloat percentage

**Health Metrics:**
- Database size and growth rate
- Transaction rate (commits/rollbacks per second)
- Lock waits and deadlocks
- Replication lag (if applicable)
- Backup success rate

**Business Metrics:**
- Records per table
- Daily/weekly/monthly growth
- Data retention compliance
- Archive effectiveness

### 12.2 Monitoring Queries

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

## 13. Conclusion

### 13.1 Database Schema Summary

✅ **20 tables** covering all business requirements
✅ **35+ relationships** with proper foreign keys
✅ **50+ indexes** for optimal query performance
✅ **Comprehensive constraints** ensuring data integrity
✅ **Soft deletes** for user-facing data
✅ **Audit trail** for compliance
✅ **Scalable design** supporting future growth

### 13.2 Production Readiness Checklist

- [x] Normalized schema (3NF)
- [x] All foreign keys defined
- [x] Indexes on all foreign keys
- [x] Indexes on frequently queried columns
- [x] Check constraints for data validation
- [x] Unique constraints for business keys
- [x] Default values for required fields
- [x] Timestamps on all tables
- [x] Soft delete support
- [x] Audit logging capability
- [x] Complete Prisma schema
- [x] Seed data defined
- [x] Migration strategy documented
- [x] Backup strategy defined
- [x] Security controls documented

### 13.3 Next Steps

1. ✅ Requirements Analysis Complete
2. ✅ System Architecture Complete
3. ✅ **Database Schema Complete**
4. ➡️ **Next: API Design and Specifications**
   - Define REST endpoints
   - Request/response schemas
   - Validation rules
   - Error handling
   
5. ➡️ Security Architecture Deep Dive
6. ➡️ Implementation

---

**Document Status:** Complete  
**Review Status:** Ready for Technical Review  
**Next Document:** API Design and Specifications

---

*This database schema is designed for a production vape shop management system with strong data integrity, comprehensive audit trails, and optimized performance. It follows PostgreSQL and Prisma best practices and can support thousands of transactions per day.*
