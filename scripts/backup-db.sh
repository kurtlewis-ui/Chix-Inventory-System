#!/bin/bash
# ============================================================================
# Database Backup Script
# Vape Shop Management System
# ============================================================================

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_CONTAINER="${DB_CONTAINER:-vape-postgres}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-vape_shop_db}"

mkdir -p "$BACKUP_DIR"

echo "Creating database backup..."
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/db_$TIMESTAMP.sql.gz"

echo "✓ Backup created: $BACKUP_DIR/db_$TIMESTAMP.sql.gz"

# Cleanup backups older than 7 days
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +7 -delete
echo "✓ Old backups cleaned up (kept last 7 days)"
