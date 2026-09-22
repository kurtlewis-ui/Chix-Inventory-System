# Prisma Database Management

This directory contains the Prisma schema and migrations for the Vape Shop Management System.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Database

Create a `.env` file in the backend directory:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/vape_shop_db?schema=public"
```

### 3. Generate Prisma Client

```bash
npx prisma generate
```

### 4. Run Migrations

```bash
# Development (creates migration and applies it)
npx prisma migrate dev --name init

# Production (applies existing migrations)
npx prisma migrate deploy
```

### 5. Seed Database

```bash
npm run db:seed
```

## Common Commands

```bash
# Generate Prisma Client
npx prisma generate

# Create a new migration
npx prisma migrate dev --name migration_name

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (CAUTION: deletes all data)
npx prisma migrate reset

# Open Prisma Studio (database GUI)
npx prisma studio

# Format schema file
npx prisma format

# Validate schema
npx prisma validate

# Pull schema from database
npx prisma db pull

# Push schema to database (prototype mode)
npx prisma db push
```

## Migration Workflow

### Development

1. Modify `schema.prisma`
2. Run `npx prisma migrate dev --name description_of_change`
3. Prisma generates migration SQL and applies it
4. Test the changes

### Production

1. Ensure all migrations are tested in staging
2. Backup production database
3. Run `npx prisma migrate deploy`
4. Verify application functionality

## Schema Overview

The database contains 20 tables organized into 6 main categories:

1. **Authentication** (3 tables)
   - roles
   - users
   - sessions

2. **Product Management** (5 tables)
   - categories
   - brands
   - suppliers
   - products
   - product_variants

3. **Inventory** (2 tables)
   - inventory
   - inventory_logs

4. **Sales** (4 tables)
   - customers
   - payment_methods
   - sales
   - sale_items

5. **Purchase Orders** (2 tables)
   - purchase_orders
   - purchase_order_items

6. **Cash Management** (2 tables)
   - shifts
   - cash_drawers

7. **System & Audit** (3 tables)
   - audit_logs
   - notifications
   - system_settings

## Troubleshooting

### Migration failed

```bash
# Mark migration as rolled back
npx prisma migrate resolve --rolled-back migration_name

# Or mark as applied
npx prisma migrate resolve --applied migration_name
```

### Client out of sync

```bash
npx prisma generate
```

### Reset everything (development only)

```bash
npx prisma migrate reset
npm run db:seed
```

## Best Practices

1. **Always backup** before running migrations in production
2. **Test migrations** in staging environment first
3. **Use descriptive names** for migrations
4. **Never modify** existing migrations after they've been applied
5. **Generate client** after schema changes
6. **Version control** all migrations

## Resources

- [Prisma Documentation](https://www.prisma.io/docs/)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [Prisma Migrate](https://www.prisma.io/docs/concepts/components/prisma-migrate)
