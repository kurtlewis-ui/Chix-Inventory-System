import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto, BranchQuantityDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { ImportProductRowDto } from './dto/import-products.dto';
import { RestockItemDto } from './dto/restock.dto';
import { slugify } from '../../common/utils/string.util';
// (UndoStockDto is validated at the controller; the service takes the id list.)
import { UploadService } from '../../common/upload/upload.service';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private upload: UploadService,
  ) {}

  async create(dto: CreateProductDto, createdBy: string, role?: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id: dto.brandId, deletedAt: null },
    });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    await this.assertBranchesExist(dto.quantities);

    // Append new products at the end of the manual order (max + 1), so a newly
    // added product shows up last in the list — matching "newest at the bottom".
    const maxOrder = await this.prisma.product.aggregate({
      _max: { sortOrder: true },
    });
    const nextSortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    // Upload a freshly-cropped image to Cloudinary (no-op if it's already a URL
    // or Cloudinary isn't configured).
    const imageValue = await this.upload.uploadDataUrl(dto.image?.trim() || null, 'products');

    const product = await this.prisma.product.create({
      data: {
        name: dto.name.trim(),
        slug: slugify(dto.name),
        image: imageValue || null,
        brandId: dto.brandId,
        sellingPrice: dto.sellingPrice,
        costPrice: dto.costPrice ?? 0,
        quantityAlert: dto.quantityAlert ?? 0,
        sortOrder: nextSortOrder,
        inventory: dto.quantities?.length
          ? {
              create: dto.quantities.map((q) => ({
                branchId: q.branchId,
                quantity: q.quantity,
                // Always store selling price per branch (direct pricing, no override logic)
                sellingPrice: q.sellingPrice ?? dto.sellingPrice,
              })),
            }
          : undefined,
      },
      include: this.includeFull(),
    });

    // Log stock movements for initial quantities
    if (dto.quantities?.length) {
      for (const q of dto.quantities) {
        if (q.quantity > 0) {
          await this.prisma.stockMovement.create({
            data: {
              productId: product.id,
              branchId: q.branchId,
              userId: createdBy,
              type: 'RESTOCK',
              quantityChange: q.quantity,
              quantityAfter: q.quantity,
              description: 'Initial stock on product creation.',
            },
          });
        }
      }
    }

    await this.audit(createdBy, 'PRODUCT_CREATED', product.id, null, {
      name: product.name,
      brand: brand.name,
    });

    return this.serialize(product, role === 'Owner');
  }

  /**
   * Persist a manual display order. `orderedIds` is the full list of product
   * IDs in the desired order (index 0 = top). Each product's sort_order is set
   * to its index. Runs in one transaction so the list can't be left half-
   * reordered. Only IDs that belong to existing active products are updated;
   * unknown IDs are ignored so a stale client can't error the whole call.
   */
  async reorder(orderedIds: string[], userId: string) {
    // Keep only IDs that map to real, non-archived products (preserving order).
    const existing = await this.prisma.product.findMany({
      where: { id: { in: orderedIds }, deletedAt: null },
      select: { id: true },
    });
    const validIdSet = new Set(existing.map((p) => p.id));
    const ids = orderedIds.filter((id) => validIdSet.has(id));

    if (ids.length === 0) {
      throw new BadRequestException('No valid products to reorder.');
    }

    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.product.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    await this.audit(userId, 'PRODUCT_REORDERED', ids[0], null, {
      count: ids.length,
    });

    return { success: true, count: ids.length };
  }

  async findAll(query: QueryProductDto, role?: string) {
    const { page = 1, limit = 20, search, brandId, branchId } = query;
    const skip = (page - 1) * limit;

    // Hide archived products AND products whose brand is archived, so an
    // archived brand's items disappear from every list/dropdown/selling screen.
    const where: any = { deletedAt: null, brand: { deletedAt: null } };
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (brandId) {
      where.brandId = brandId;
    }

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        select: this.selectFull(branchId),
        // Manual display order (owners can drag to reorder); creation order is
        // the tie-breaker so products without an explicit order stay stable.
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    const includeOwnerFields = role === 'Owner';
    return {
      data: products.map((p) => this.serialize(p, includeOwnerFields)),
      pagination: this.paginate(page, limit, total),
    };
  }

  async findArchived(query: QueryProductDto, role?: string) {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: { not: null } };
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        select: this.selectFull(),
        orderBy: { deletedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const includeOwnerFields = role === 'Owner';
    return {
      data: products.map((p) => this.serialize(p, includeOwnerFields)),
      pagination: this.paginate(page, limit, total),
    };
  }

  async findOne(id: string, role?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: this.includeFull(),
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.serialize(product, role === 'Owner');
  }

  async update(id: string, dto: UpdateProductDto, updatedBy: string, role?: string) {
    const current = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) {
      throw new NotFoundException('Product not found');
    }

    if (dto.brandId) {
      const brand = await this.prisma.brand.findFirst({
        where: { id: dto.brandId, deletedAt: null },
      });
      if (!brand) {
        throw new NotFoundException('Brand not found');
      }
    }

    await this.assertBranchesExist(dto.quantities);

    const data: any = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
      data.slug = slugify(dto.name);
    }
    if (dto.image !== undefined) data.image = await this.upload.uploadDataUrl(dto.image?.trim() || null, 'products');
    if (dto.brandId !== undefined) data.brandId = dto.brandId;
    if (dto.sellingPrice !== undefined) data.sellingPrice = dto.sellingPrice;
    // Owner-only cost price: persist ONLY when a value is explicitly provided so
    // that a normal edit (which omits costPrice) never overwrites the stored
    // cost back to 0. Non-owner edits never include costPrice in the payload.
    if (dto.costPrice !== undefined) data.costPrice = dto.costPrice;
    if (dto.quantityAlert !== undefined) data.quantityAlert = dto.quantityAlert;

    await this.prisma.product.update({ where: { id }, data });

    // DIRECT PER-BRANCH PRICING (no override, no fallback wiping):
    // The product-level `sellingPrice` is ONLY a default/reference used when a
    // brand-new branch inventory row is created without its own price. Editing
    // it must NEVER overwrite prices that branches already have. Each branch
    // owns its price via inventory.sellingPrice and is updated ONLY through the
    // per-branch quantities payload below. This is the fix for the bug where an
    // "All Shops" edit flattened every branch back to the default price.

    // Upsert per-branch quantities when provided, and log stock movements.
    // Collect the ids of ADJUSTMENT movements this edit creates so the client
    // can offer a one-tap "Undo" of exactly this edit's quantity changes.
    //
    // Batched: read all current quantities for this product in ONE query, then
    // commit every upsert + movement in a SINGLE transaction (previously this
    // did ~2 sequential round-trips per branch, which made "edit all shops"
    // slow). Movement ordering is preserved so undoMovementIds stays correct.
    const undoMovementIds: string[] = [];
    if (dto.quantities?.length) {
      const currentRows = await this.prisma.inventory.findMany({
        where: { productId: id, branchId: { in: dto.quantities.map((q) => q.branchId) } },
        select: { branchId: true, quantity: true },
      });
      const oldQtyByBranch = new Map(currentRows.map((r) => [r.branchId, r.quantity]));

      const ops: any[] = [];
      // Track which ops are the movement.create calls (and for which branch) so
      // we can map their returned ids back after the transaction.
      const movementOpIndexes: number[] = [];
      for (const q of dto.quantities) {
        const oldQty = oldQtyByBranch.get(q.branchId) ?? 0;
        const newQty = q.quantity;
        const diff = newQty - oldQty;

        ops.push(
          this.prisma.inventory.upsert({
            where: { productId_branchId: { productId: id, branchId: q.branchId } },
            create: { productId: id, branchId: q.branchId, quantity: q.quantity, sellingPrice: q.sellingPrice ?? null },
            update: { quantity: q.quantity, ...(q.sellingPrice !== undefined ? { sellingPrice: q.sellingPrice ?? null } : {}) },
          }),
        );

        if (diff !== 0) {
          movementOpIndexes.push(ops.length);
          ops.push(
            this.prisma.stockMovement.create({
              data: {
                productId: id,
                branchId: q.branchId,
                userId: updatedBy,
                type: 'ADJUSTMENT',
                quantityChange: diff,
                quantityAfter: newQty,
                description: 'Updated quantity.',
              },
              select: { id: true },
            }),
          );
        }
      }

      if (ops.length) {
        const results = await this.prisma.$transaction(ops);
        for (const idx of movementOpIndexes) {
          const r = results[idx] as { id?: string };
          if (r?.id) undoMovementIds.push(r.id);
        }
      }
    }

    const updated = await this.prisma.product.findUnique({
      where: { id },
      include: this.includeFull(),
    });

    await this.audit(
      updatedBy,
      'PRODUCT_UPDATED',
      id,
      { name: current.name },
      data,
    );

    const serialized = this.serialize(updated!, role === 'Owner');
    // Attach the undoable movement ids (empty when no quantity actually changed).
    return { ...serialized, undoMovementIds };
  }

  async remove(id: string, deletedBy: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit(
      deletedBy,
      'PRODUCT_ARCHIVED',
      id,
      { name: product.name },
      null,
    );

    return { message: 'Product archived successfully' };
  }

  async restore(id: string, restoredBy: string, role?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: { not: null } },
      include: { brand: true },
    });
    if (!product) {
      throw new NotFoundException('Archived product not found');
    }
    if (product.brand.deletedAt) {
      throw new BadRequestException(
        'Cannot restore: the product brand is archived. Restore the brand first.',
      );
    }

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: null, isActive: true },
    });

    await this.audit(restoredBy, 'PRODUCT_RESTORED', id, null, {
      name: product.name,
    });

    return this.findOne(id, role);
  }

  /**
   * Bulk import/upsert products from parsed rows (e.g. a CSV). Brands are
   * matched by name and auto-created when missing. Per-branch quantities are
   * matched to existing shops by name (unknown shop names are reported).
   */
  async importProducts(rows: ImportProductRowDto[], userId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    const branchByName = new Map(
      branches.map((b) => [b.name.toLowerCase(), b.id]),
    );

    let created = 0;
    let updated = 0;
    const warnings: string[] = [];

    for (const [index, row] of rows.entries()) {
      const name = row.name?.trim();
      const brandName = row.brand?.trim();
      if (!name || !brandName) {
        warnings.push(`Row ${index + 1}: missing name or brand — skipped`);
        continue;
      }

      // Resolve or create the brand.
      let brand = await this.prisma.brand.findFirst({
        where: { name: { equals: brandName, mode: 'insensitive' }, deletedAt: null },
      });
      if (!brand) {
        brand = await this.prisma.brand.create({
          data: { name: brandName, slug: slugify(brandName) },
        });
      }

      // Build inventory rows from matched branches.
      const invRows: { branchId: string; quantity: number }[] = [];
      for (const q of row.quantities ?? []) {
        const branchId = branchByName.get(q.branchName.trim().toLowerCase());
        if (!branchId) {
          warnings.push(`Row ${index + 1}: unknown shop "${q.branchName}" — skipped`);
          continue;
        }
        invRows.push({ branchId, quantity: q.quantity });
      }

      const existing = await this.prisma.product.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, deletedAt: null },
      });

      if (existing) {
        await this.prisma.product.update({
          where: { id: existing.id },
          data: {
            brandId: brand.id,
            sellingPrice: row.sellingPrice,
            quantityAlert: row.quantityAlert ?? 0,
          },
        });
        for (const inv of invRows) {
          const currentInv = await this.prisma.inventory.findUnique({
            where: { productId_branchId: { productId: existing.id, branchId: inv.branchId } },
          });
          const oldQty = currentInv?.quantity ?? 0;
          await this.prisma.inventory.upsert({
            where: { productId_branchId: { productId: existing.id, branchId: inv.branchId } },
            create: { productId: existing.id, branchId: inv.branchId, quantity: inv.quantity },
            update: { quantity: inv.quantity },
          });
          const diff = inv.quantity - oldQty;
          if (diff !== 0) {
            await this.prisma.stockMovement.create({
              data: {
                productId: existing.id,
                branchId: inv.branchId,
                userId,
                type: 'ADJUSTMENT',
                quantityChange: diff,
                quantityAfter: inv.quantity,
                description: 'Imported product quantity update.',
              },
            });
          }
        }
        updated++;
      } else {
        const newProduct = await this.prisma.product.create({
          data: {
            name,
            slug: slugify(name),
            brandId: brand.id,
            sellingPrice: row.sellingPrice,
            quantityAlert: row.quantityAlert ?? 0,
            inventory: invRows.length ? { create: invRows } : undefined,
          },
        });
        // Log stock movements for newly created products
        for (const inv of invRows) {
          if (inv.quantity > 0) {
            await this.prisma.stockMovement.create({
              data: {
                productId: newProduct.id,
                branchId: inv.branchId,
                userId,
                type: 'RESTOCK',
                quantityChange: inv.quantity,
                quantityAfter: inv.quantity,
                description: 'Initial stock from import.',
              },
            });
          }
        }
        created++;
      }
    }

    await this.audit(userId, 'PRODUCTS_IMPORTED', userId, null, {
      created,
      updated,
    });

    return { created, updated, total: rows.length, warnings };
  }

  /**
   * Add stock to products at branches. Each item adds `quantity` to the current
   * inventory (creating the inventory row if needed). Products/branches can be
   * referenced by id or by name (name is used for CSV-style restocks).
   */
  async restock(items: RestockItemDto[], userId: string) {
    const warnings: string[] = [];

    // --- Resolve products + branches + existing inventory in BULK up front ---
    // (Previously this did ~5 sequential DB round-trips PER item, which made a
    // "restock all branches" upload very slow. Now we do a handful of bulk
    // queries, then commit all writes in a single transaction.)
    const wantedProductIds = new Set<string>();
    const wantedProductNames = new Set<string>();
    const wantedBranchIds = new Set<string>();
    const wantedBranchNames = new Set<string>();
    for (const item of items) {
      if (item.productId) wantedProductIds.add(item.productId);
      else if (item.productName) wantedProductNames.add(item.productName.trim().toLowerCase());
      if (item.branchId) wantedBranchIds.add(item.branchId);
      else if (item.branchName) wantedBranchNames.add(item.branchName.trim().toLowerCase());
    }

    // Products: only active products whose brand isn't archived can be restocked.
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, brand: { deletedAt: null } },
      select: { id: true, name: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    const productByName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));

    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    const branchById = new Map(branches.map((b) => [b.id, b]));
    const branchByName = new Map(branches.map((b) => [b.name.trim().toLowerCase(), b]));

    // First pass: resolve each row to a (productId, branchId, quantity) target.
    // REFUSE-ON-MISMATCH: if ANY row references an unknown product or shop, we
    // apply NOTHING and report exactly which rows failed — so a mismatched file
    // can never silently produce a partial restock that doesn't match the Excel.
    const qtyKey = (p: string, b: string) => `${p}__${b}`;
    // Aggregate duplicate (product, branch) pairs by SUMMING their quantities,
    // so the same pair appearing twice in a file adds the correct total once.
    const addByKey = new Map<string, { productId: string; branchId: string; quantity: number }>();
    for (const [index, item] of items.entries()) {
      const product = item.productId
        ? productById.get(item.productId)
        : item.productName
          ? productByName.get(item.productName.trim().toLowerCase())
          : undefined;
      if (!product) {
        warnings.push(`Row ${index + 1}: product not found (${item.productName ?? item.productId})`);
        continue;
      }
      const branch = item.branchId
        ? branchById.get(item.branchId)
        : item.branchName
          ? branchByName.get(item.branchName.trim().toLowerCase())
          : undefined;
      if (!branch) {
        warnings.push(`Row ${index + 1}: shop not found (${item.branchName ?? item.branchId})`);
        continue;
      }
      const key = qtyKey(product.id, branch.id);
      const prev = addByKey.get(key);
      if (prev) prev.quantity += item.quantity;
      else addByKey.set(key, { productId: product.id, branchId: branch.id, quantity: item.quantity });
    }

    // Any unmatched row => refuse the WHOLE upload (nothing has been written yet).
    if (warnings.length > 0) {
      throw new BadRequestException(
        `Restock cancelled — ${warnings.length} row(s) didn't match a product or shop, so nothing was changed. ` +
          `Fix the file and re-upload. Details: ${warnings.slice(0, 10).join('; ')}` +
          (warnings.length > 10 ? ` …and ${warnings.length - 10} more.` : ''),
      );
    }

    const targets = [...addByKey.values()];
    if (targets.length === 0) {
      await this.audit(userId, 'PRODUCTS_RESTOCKED', userId, null, { updated: 0 });
      return { updated: 0, total: items.length, warnings, movementIds: [] as string[] };
    }

    // Current quantities for the affected pairs, so quantityAfter = before + add
    // is exact (no per-row re-read needed).
    const existing = await this.prisma.inventory.findMany({
      where: {
        productId: { in: [...new Set(targets.map((t) => t.productId))] },
        branchId: { in: [...new Set(targets.map((t) => t.branchId))] },
      },
      select: { productId: true, branchId: true, quantity: true },
    });
    const currentQty = new Map(existing.map((e) => [qtyKey(e.productId, e.branchId), e.quantity]));

    // Rows that don't have an inventory row yet must be created (at 0) BEFORE
    // the bulk increment so the UPDATE has something to add to.
    const existingKeys = new Set(existing.map((e) => qtyKey(e.productId, e.branchId)));
    const missing = targets.filter((t) => !existingKeys.has(qtyKey(t.productId, t.branchId)));

    // Movement rows (RESTOCK, positive add). quantityAfter computed from the
    // snapshot: before (0 for missing) + amount added.
    const movementData = targets.map((t) => {
      const before = currentQty.get(qtyKey(t.productId, t.branchId)) ?? 0;
      return {
        productId: t.productId,
        branchId: t.branchId,
        userId,
        type: 'RESTOCK' as const,
        quantityChange: t.quantity,
        quantityAfter: before + t.quantity,
        description: 'Restocked product.',
      };
    });

    // ONE parameterized bulk UPDATE that increments each pair by its own amount:
    //   UPDATE inventory SET quantity = quantity + v.add
    //   FROM (VALUES ($1::uuid,$2::uuid,$3::int), ...) AS v(pid, bid, add)
    //   WHERE inventory.product_id = v.pid AND inventory.branch_id = v.bid
    // Values are bound as parameters (never string-interpolated).
    const valueRows = targets.map(
      (t) => Prisma.sql`(${t.productId}::uuid, ${t.branchId}::uuid, ${t.quantity}::int)`,
    );
    const bulkIncrement = Prisma.sql`
      UPDATE "inventory" AS inv
      SET "quantity" = inv."quantity" + v.add, "updated_at" = NOW()
      FROM (VALUES ${Prisma.join(valueRows)}) AS v(pid, bid, add)
      WHERE inv."product_id" = v.pid AND inv."branch_id" = v.bid
    `;

    // Everything in ONE transaction (all-or-nothing): create missing rows,
    // increment all pairs in a single statement, then insert all movements
    // (createManyAndReturn gives us the ids for the one-tap Undo).
    const created = await this.prisma.$transaction(async (tx) => {
      if (missing.length > 0) {
        await tx.inventory.createMany({
          data: missing.map((m) => ({ productId: m.productId, branchId: m.branchId, quantity: 0 })),
          skipDuplicates: true,
        });
      }
      await tx.$executeRaw(bulkIncrement);
      return tx.stockMovement.createManyAndReturn({
        data: movementData,
        select: { id: true },
      });
    });

    const movementIds = created.map((m) => m.id);

    await this.audit(userId, 'PRODUCTS_RESTOCKED', userId, null, { updated: targets.length });

    // Return the ids of the movements we just created so the client can offer a
    // precise, one-tap "Undo" of exactly this batch.
    return { updated: targets.length, total: items.length, warnings, movementIds };
  }

  /**
   * Owner-only: set EVERY product's stock to 0 at EVERY branch. Destructive —
   * guarded by a type-to-confirm at the controller. Only rows that currently
   * have stock (> 0) are touched, and each change is logged as an ADJUSTMENT
   * stock movement (quantityChange = -oldQty, quantityAfter = 0) so there's a
   * full audit trail of what was cleared. Runs in a single transaction so it's
   * fast and all-or-nothing.
   */
  async resetAllStock(userId: string) {
    // Only rows with stock need zeroing + a movement.
    const rows = await this.prisma.inventory.findMany({
      where: { quantity: { gt: 0 } },
      select: { id: true, productId: true, branchId: true, quantity: true },
    });

    if (rows.length === 0) {
      await this.audit(userId, 'STOCK_RESET_ALL', userId, null, { cleared: 0 });
      return { cleared: 0 };
    }

    // Build one history movement per row that had stock (records what was
    // cleared). These are inserted in a SINGLE statement via createMany.
    const movementData = rows.map((r) => ({
      productId: r.productId,
      branchId: r.branchId,
      userId,
      type: 'ADJUSTMENT' as const,
      quantityChange: -r.quantity,
      quantityAfter: 0,
      description: 'Reset all stock to 0.',
    }));

    // TWO bulk statements in one transaction (all-or-nothing): zero every row
    // that has stock, and log all the movements at once. This replaces the old
    // ~2 statements PER ROW loop (thousands of round-trips) — now it's ~2
    // statements total, so a full reset is near-instant.
    await this.prisma.$transaction([
      this.prisma.inventory.updateMany({
        where: { quantity: { gt: 0 } },
        data: { quantity: 0 },
      }),
      this.prisma.stockMovement.createMany({ data: movementData }),
    ]);

    await this.audit(userId, 'STOCK_RESET_ALL', userId, null, { cleared: rows.length });

    return { cleared: rows.length };
  }

  /**
   * Owner-only UNDO of stock movements (a restock batch or a manual quantity
   * edit). Each movement is reversed by appending a COMPENSATING ADJUSTMENT
   * movement — the original row is never modified or deleted, so the ledger
   * stays a complete, auditable history (the undo itself shows up too).
   *
   * Safety rules (a movement is SKIPPED, with a reason, if any fail):
   *  - Only RESTOCK and ADJUSTMENT movements can be undone.
   *  - The movement must be the MOST RECENT one for its product+branch. This
   *    prevents out-of-order corrections (e.g. undoing an old restock after a
   *    sale happened) from producing a wrong count.
   *  - Undoing must not drive stock negative.
   *  - A movement that is itself an undo, or that has already been undone,
   *    can't be undone again (idempotent).
   *
   * Everything runs in a single transaction so stock and the ledger never end
   * up half-applied.
   */
  async undoStockMovements(movementIds: string[], userId: string) {
    const undone: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    // De-duplicate while preserving order.
    const ids = [...new Set(movementIds)];

    for (const id of ids) {
      const movement = await this.prisma.stockMovement.findUnique({ where: { id } });
      if (!movement) {
        skipped.push({ id, reason: 'Movement not found.' });
        continue;
      }
      if (movement.type !== 'RESTOCK' && movement.type !== 'ADJUSTMENT') {
        skipped.push({ id, reason: 'Only restock or quantity-edit movements can be undone.' });
        continue;
      }
      // An undo we previously wrote is tagged in its description; never undo an undo.
      if (movement.description && movement.description.startsWith('Undo:')) {
        skipped.push({ id, reason: 'This entry is itself an undo.' });
        continue;
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          // Re-read INSIDE the transaction and confirm this is still the most
          // recent movement for the product+branch. If anything newer exists
          // (a sale, another restock, or an undo we already applied), refuse.
          const latest = await tx.stockMovement.findFirst({
            where: { productId: movement.productId, branchId: movement.branchId },
            // Order by seq (insertion order) to match how the history UI decides
            // "newest" — so undo agrees with the row shown at the top.
            orderBy: { seq: 'desc' },
          });
          if (!latest || latest.id !== movement.id) {
            throw new BadRequestException(
              'There is newer stock activity for this product/shop — undo the most recent action first.',
            );
          }

          const inv = await tx.inventory.findUnique({
            where: { productId_branchId: { productId: movement.productId, branchId: movement.branchId } },
          });
          const currentQty = inv?.quantity ?? 0;
          const reverseDelta = -movement.quantityChange; // inverse of the original
          const newQty = currentQty + reverseDelta;
          if (newQty < 0) {
            throw new BadRequestException(
              'Undo would make stock negative (items were sold or used since).',
            );
          }

          await tx.inventory.upsert({
            where: { productId_branchId: { productId: movement.productId, branchId: movement.branchId } },
            create: { productId: movement.productId, branchId: movement.branchId, quantity: newQty },
            update: { quantity: newQty },
          });

          const label = movement.type === 'RESTOCK' ? 'restock' : 'quantity edit';
          await tx.stockMovement.create({
            data: {
              productId: movement.productId,
              branchId: movement.branchId,
              userId,
              type: 'ADJUSTMENT',
              quantityChange: reverseDelta,
              quantityAfter: newQty,
              description: `Undo: reverted a ${label}.`,
            },
          });
        });
        undone.push(id);
      } catch (e: any) {
        skipped.push({ id, reason: e?.message ?? 'Could not undo this movement.' });
      }
    }

    if (undone.length === 0 && skipped.length > 0) {
      // Nothing could be undone — surface the first reason so the UI can show it.
      throw new BadRequestException(skipped[0].reason);
    }

    await this.audit(userId, 'STOCK_MOVEMENTS_UNDONE', userId, null, {
      undone: undone.length,
      skipped: skipped.length,
    });

    return { undone: undone.length, skipped };
  }

  private async assertBranchesExist(quantities?: BranchQuantityDto[]) {
    if (!quantities?.length) return;
    const ids = [...new Set(quantities.map((q) => q.branchId))];
    const found = await this.prisma.branch.count({
      where: { id: { in: ids }, deletedAt: null },
    });
    if (found !== ids.length) {
      throw new BadRequestException('One or more branches do not exist');
    }
  }

  private includeFull(branchId?: string) {
    return {
      brand: { select: { id: true, name: true, slug: true } },
      inventory: {
        where: branchId ? { branchId } : undefined,
        include: { branch: { select: { id: true, name: true } } },
      },
    };
  }

  /**
   * Like includeFull, but as an explicit `select` that lists ONLY the columns
   * serialize() actually reads. Used by the LIST endpoints (findAll /
   * findArchived) where fetching every product column — notably the large
   * `image` text field on every row — makes big responses slow. This returns
   * the exact same shape serialize() expects (same brand/inventory nesting and
   * the image field), so the API response is unchanged; only the set of columns
   * pulled from Postgres is trimmed. Write paths keep using includeFull().
   */
  private selectFull(branchId?: string): Prisma.ProductSelect {
    return {
      id: true,
      name: true,
      slug: true,
      image: true,
      sellingPrice: true,
      costPrice: true,
      quantityAlert: true,
      sortOrder: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      brand: { select: { id: true, name: true, slug: true } },
      inventory: {
        where: branchId ? { branchId } : undefined,
        select: {
          branchId: true,
          quantity: true,
          sellingPrice: true,
          branch: { select: { id: true, name: true } },
        },
      },
    };
  }

  private serialize(product: any, includeOwnerFields = false) {
    const defaultPrice = Number(product.sellingPrice);
    const quantities = (product.inventory ?? []).map((inv: any) => ({
      branchId: inv.branchId,
      branchName: inv.branch?.name ?? null,
      quantity: inv.quantity,
      // If branch has its own price use it; otherwise show product's default
      sellingPrice: inv.sellingPrice != null ? Number(inv.sellingPrice) : defaultPrice,
    }));
    const totalQuantity = quantities.reduce(
      (sum: number, q: any) => sum + q.quantity,
      0,
    );

    // For the top-level sellingPrice: when one branch is filtered, use that branch's price.
    // When multiple branches (All Shops), use the product's base price as reference.
    const branchPrice = quantities.length === 1
      ? quantities[0].sellingPrice
      : Number(product.sellingPrice);

    const result: any = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      image: product.image,
      brand: product.brand
        ? { id: product.brand.id, name: product.brand.name, slug: product.brand.slug }
        : null,
      sellingPrice: branchPrice,
      quantityAlert: product.quantityAlert,
      sortOrder: product.sortOrder,
      isActive: product.isActive,
      quantities,
      totalQuantity,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      deletedAt: product.deletedAt,
    };

    // Only include costPrice for Owner role (confidential)
    if (includeOwnerFields) {
      result.costPrice = Number(product.costPrice);
    }

    return result;
  }

  private paginate(page: number, limit: number, total: number) {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
  }

  private audit(
    userId: string,
    action: string,
    entityId: string,
    oldValues: any,
    newValues: any,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType: 'Product',
        entityId,
        oldValues: oldValues ?? undefined,
        newValues: newValues ?? undefined,
      },
    });
  }
}
