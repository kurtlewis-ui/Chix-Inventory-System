/**
 * ============================================================================
 * FULL SALES RESET SCRIPT  (one-time, destructive — read this before running)
 * ============================================================================
 *
 * WHAT THIS DOES (across ALL branches, the whole website):
 *   1. Restores stock for every PENDING and APPROVED sale (adds the sold
 *      quantities back into `inventory`). DECLINED sales are skipped because
 *      their stock was already returned when they were declined.
 *   2. Deletes ALL sales (PENDING + APPROVED + DECLINED). `sale_items` are
 *      removed automatically via the onDelete: Cascade relation.
 *   3. Deletes ALL expenses and ALL disposals (so the dashboard Net / Profit
 *      lines also fall back to 0).
 *   4. Deletes ALL stock movements (the SALE / RETURN / etc. history log).
 *   5. Resets the per-branch daily sale counters, so the next sale in each
 *      branch starts numbering at #1 again.
 *   6. Clears any in-progress draft carts (draft_orders).
 *
 * RESULT: every sales figure on the dashboard (approvedSalesTotal,
 * approvedSales/pendingSales counts, sales overview chart, top products,
 * branch summary, profit & sales summaries) computes to 0, and inventory is
 * restored to what it would be if those sales had never happened.
 *
 * ----------------------------------------------------------------------------
 * SAFETY
 * ----------------------------------------------------------------------------
 *   - This is IRREVERSIBLE. TAKE A DATABASE BACKUP FIRST. On Postgres:
 *         pg_dump "$DATABASE_URL" > backup-before-reset.sql
 *   - It refuses to run unless you pass --confirm (a --dry-run shows the
 *     counts it WOULD affect without changing anything).
 *   - Everything runs inside a single transaction: if any step fails, the
 *     whole reset rolls back and nothing is changed.
 *
 * ----------------------------------------------------------------------------
 * USAGE
 * ----------------------------------------------------------------------------
 *   # Preview what will happen (no changes):
 *   npm run reset:sales -- --dry-run
 *
 *   # Actually perform the reset:
 *   npm run reset:sales -- --confirm
 *
 *   # Restore stock but DON'T delete stock-movement history:
 *   npm run reset:sales -- --confirm --keep-movements
 *
 *   # Delete sales but DON'T restore inventory (rarely wanted):
 *   npm run reset:sales -- --confirm --no-restore-stock
 * ============================================================================
 */

import { PrismaClient, Prisma, SaleStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ---- CLI flags -------------------------------------------------------------
const args = process.argv.slice(2);
const hasFlag = (f: string) => args.includes(f);

const DRY_RUN = hasFlag('--dry-run');
const CONFIRMED = hasFlag('--confirm');
const RESTORE_STOCK = !hasFlag('--no-restore-stock');
const KEEP_MOVEMENTS = hasFlag('--keep-movements');

function banner() {
  console.log('');
  console.log('==================================================================');
  console.log('  FULL SALES RESET  —  all branches, entire website');
  console.log('==================================================================');
  console.log(`  Mode:            ${DRY_RUN ? 'DRY RUN (no changes)' : CONFIRMED ? 'LIVE (will modify data)' : 'NO-OP (missing --confirm)'}`);
  console.log(`  Restore stock:   ${RESTORE_STOCK ? 'yes' : 'NO (--no-restore-stock)'}`);
  console.log(`  Stock movements: ${KEEP_MOVEMENTS ? 'kept (--keep-movements)' : 'deleted'}`);
  console.log('==================================================================');
  console.log('');
}

async function main() {
  banner();

  if (!DRY_RUN && !CONFIRMED) {
    console.error('Refusing to run. Pass --confirm to perform the reset, or --dry-run to preview.');
    console.error('Reminder: take a database backup first  ->  pg_dump "$DATABASE_URL" > backup.sql');
    process.exitCode = 1;
    return;
  }

  // ---- Snapshot current counts (what we are about to affect) --------------
  const [
    salesTotal,
    pendingCount,
    approvedCount,
    declinedCount,
    saleItemCount,
    expenseCount,
    disposalCount,
    movementCount,
    counterCount,
    draftCount,
  ] = await Promise.all([
    prisma.sale.count(),
    prisma.sale.count({ where: { status: SaleStatus.PENDING } }),
    prisma.sale.count({ where: { status: SaleStatus.APPROVED } }),
    prisma.sale.count({ where: { status: SaleStatus.DECLINED } }),
    prisma.saleItem.count(),
    prisma.expense.count(),
    prisma.disposal.count(),
    prisma.stockMovement.count(),
    prisma.dailySaleCounter.count(),
    prisma.draftOrder.count(),
  ]);

  console.log('Current data:');
  console.log(`  Sales:            ${salesTotal}  (pending ${pendingCount}, approved ${approvedCount}, declined ${declinedCount})`);
  console.log(`  Sale items:       ${saleItemCount}  (cascade-deleted with sales)`);
  console.log(`  Expenses:         ${expenseCount}`);
  console.log(`  Disposals:        ${disposalCount}`);
  console.log(`  Stock movements:  ${movementCount}${KEEP_MOVEMENTS ? '  (will be kept)' : ''}`);
  console.log(`  Daily counters:   ${counterCount}`);
  console.log(`  Draft carts:      ${draftCount}`);
  console.log('');

  // Stock that will be restored = sum of quantities from PENDING + APPROVED
  // sale items only. (DECLINED already had stock returned at decline time.)
  const toRestore = await prisma.saleItem.findMany({
    where: {
      productId: { not: null },
      sale: { status: { in: [SaleStatus.PENDING, SaleStatus.APPROVED] } },
    },
    select: {
      productId: true,
      quantity: true,
      sale: { select: { branchId: true } },
    },
  });

  // Aggregate quantity per (productId, branchId) so we do one UPDATE per pair.
  const restoreMap = new Map<string, { productId: string; branchId: string; quantity: number }>();
  for (const item of toRestore) {
    if (!item.productId) continue;
    const key = `${item.productId}::${item.sale.branchId}`;
    const entry = restoreMap.get(key);
    if (entry) entry.quantity += item.quantity;
    else restoreMap.set(key, { productId: item.productId, branchId: item.sale.branchId, quantity: item.quantity });
  }

  const restoreList = [...restoreMap.values()];
  const totalUnitsToRestore = restoreList.reduce((s, r) => s + r.quantity, 0);

  console.log(`Stock to restore: ${totalUnitsToRestore} units across ${restoreList.length} product/branch pairs` +
    `${RESTORE_STOCK ? '' : '  (SKIPPED — --no-restore-stock)'}`);
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN complete. No changes were made.');
    return;
  }

  // ---- Perform the reset in a single transaction --------------------------
  await prisma.$transaction(async (tx) => {
    // 1) Restore inventory for pending + approved sale items.
    if (RESTORE_STOCK) {
      for (const r of restoreList) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "inventory" ("id", "product_id", "branch_id", "quantity", "updated_at")
          VALUES (gen_random_uuid(), ${r.productId}::uuid, ${r.branchId}::uuid, ${r.quantity}, NOW())
          ON CONFLICT ("product_id", "branch_id")
          DO UPDATE SET "quantity" = "inventory"."quantity" + ${r.quantity}, "updated_at" = NOW()
        `);
      }
    }

    // 2) Delete all sales (sale_items cascade automatically).
    const delSales = await tx.sale.deleteMany({});

    // 3) Delete all expenses and disposals.
    const delExpenses = await tx.expense.deleteMany({});
    const delDisposals = await tx.disposal.deleteMany({});

    // 4) Delete stock-movement history (unless kept).
    let delMovements = { count: 0 };
    if (!KEEP_MOVEMENTS) {
      delMovements = await tx.stockMovement.deleteMany({});
    }

    // 5) Reset per-branch daily sale numbering.
    const delCounters = await tx.dailySaleCounter.deleteMany({});

    // 6) Clear in-progress draft carts.
    const delDrafts = await tx.draftOrder.deleteMany({});

    console.log('Reset applied:');
    console.log(`  Sales deleted:            ${delSales.count}`);
    console.log(`  Expenses deleted:         ${delExpenses.count}`);
    console.log(`  Disposals deleted:        ${delDisposals.count}`);
    console.log(`  Stock movements deleted:  ${KEEP_MOVEMENTS ? 'kept' : delMovements.count}`);
    console.log(`  Daily counters reset:     ${delCounters.count}`);
    console.log(`  Draft carts cleared:      ${delDrafts.count}`);
    if (RESTORE_STOCK) {
      console.log(`  Inventory restored:       ${totalUnitsToRestore} units (${restoreList.length} pairs)`);
    }
  });

  // ---- Verify everything is zero ------------------------------------------
  const [salesAfter, expensesAfter, disposalsAfter] = await Promise.all([
    prisma.sale.count(),
    prisma.expense.count(),
    prisma.disposal.count(),
  ]);

  console.log('');
  console.log('Verification — dashboard sources are now:');
  console.log(`  Sales:      ${salesAfter}  (approvedSalesTotal, all counts, overview, top products -> 0)`);
  console.log(`  Expenses:   ${expensesAfter}`);
  console.log(`  Disposals:  ${disposalsAfter}`);
  console.log('');
  console.log(salesAfter === 0 && expensesAfter === 0 && disposalsAfter === 0
    ? 'Full clean reset complete. Every dashboard sales figure is back to 0.'
    : 'WARNING: some tables are not empty — please review the output above.');
}

main()
  .catch((e) => {
    console.error('Reset FAILED — transaction rolled back, no changes were made:');
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
