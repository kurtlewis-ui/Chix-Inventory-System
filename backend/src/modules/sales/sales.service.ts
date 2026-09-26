import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SaleStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import { businessDateOnly, businessDayRange } from '../../common/utils/business-day.util';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a sale. Stock is reserved (decremented) immediately, at creation —
   * not at approval — so two pending sales for the same product can't both
   * "look valid" only to have the second approval mysteriously fail later.
   * If declined or deleted while still pending, the reservation is restored.
   */
  async create(dto: CreateSaleDto, actor: RequestUser) {
    const branchId = await this.resolveBranchForActor(actor, dto.branchId);

    // Load all referenced products in one query, including THIS branch's
    // inventory row so we can price each line at the branch's own price.
    // Block archived products AND products whose brand is archived — an
    // archived brand/product must not be sellable.
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null, brand: { deletedAt: null } },
      include: {
        brand: { select: { name: true } },
        inventory: { where: { branchId }, select: { sellingPrice: true } },
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));
    const branchPriceMap = new Map(
      products.map((p) => [p.id, p.inventory[0]?.sellingPrice ?? null]),
    );

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products are unavailable (archived or from an archived brand).');
    }

    const items = this.buildSaleItems(dto.items, productMap, branchPriceMap);

    const total = items.reduce(
      (sum, i) => sum.add(i.subTotal),
      new Prisma.Decimal(0),
    );

    const sale = await this.prisma.$transaction(async (tx) => {
      await this.reserveStock(tx, branchId, items, actor.userId);
      const number = await this.nextDailyNumber(tx, branchId);

      const created = await tx.sale.create({
        data: {
          branchId,
          number,
          staffId: actor.userId,
          customerName: dto.customerName?.trim() || null,
          paymentMethod: this.rollupPaymentMethod(items),
          status: SaleStatus.PENDING,
          total,
          items: { create: items },
        },
        include: this.includeFull(),
      });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'SALE_CREATED',
          entityType: 'Sale',
          entityId: created.id,
          newValues: { number: created.number, total: total.toString() },
        },
      });

      return created;
    });

    return this.serialize(sale);
  }

  async findRecords(query: QuerySaleDto, actor: RequestUser) {
    return this.list(query, actor, SaleStatus.APPROVED);
  }

  async findPending(query: QuerySaleDto, actor: RequestUser) {
    return this.list(query, actor, SaleStatus.PENDING);
  }

  private async list(
    query: QuerySaleDto,
    actor: RequestUser,
    status: SaleStatus,
  ) {
    const { page = 1, limit = 20, search, branchId, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SaleWhereInput = { status };

    // Staff are scoped to their own branch.
    if (actor.role === 'Staff') {
      const me = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { branchId: true },
      });
      where.branchId = me?.branchId ?? '00000000-0000-0000-0000-000000000000';
    } else if (branchId) {
      where.branchId = branchId;
    }

    if (startDate || endDate) {
      // Filter by PH BUSINESS day (2 AM–2 AM), matching how sales are numbered,
      // so a sale made after midnight still counts under the same business day
      // and shows on the day's report. Window is [start 2AM PH, next-day 2AM PH).
      where.createdAt = businessDayRange(startDate, endDate);
    }

    if (search) {
      where.OR = [
        { items: { some: { name: { contains: search, mode: 'insensitive' } } } },
        { items: { some: { brandName: { contains: search, mode: 'insensitive' } } } },
        { staff: { firstName: { contains: search, mode: 'insensitive' } } },
        { staff: { lastName: { contains: search, mode: 'insensitive' } } },
        { customerName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, sales, summaryItems] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        include: this.includeFull(),
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      // Summary across the whole filtered set (not just current page).
      // Payment now varies per item, so this sums item-level amounts
      // (splitting Split-payment items across their buckets) rather than a
      // DB-level groupBy on the sale's single payment method.
      this.prisma.saleItem.findMany({
        where: { sale: where },
        select: { paymentMethod: true, subTotal: true, paymentSplit: true, discount: true, unitPrice: true, quantity: true },
      }),
    ]);

    // grossSales = Σ(unitPrice × qty) BEFORE discount. total (net) below is
    // grossSales − discount. Showing both makes the reduction transparent:
    // Gross − Discount = Net. The discount is only ever subtracted ONCE
    // (gross → net); the cash/gcash buckets already use the net subTotal.
    const summary = { grossSales: 0, cash: 0, gcash: 0, bankTransfer: 0, discount: 0, total: 0, count: total };
    for (const item of summaryItems) {
      summary.grossSales += Number(item.unitPrice) * item.quantity;
      // Total Discount is the sum of per-item discounts. This is DISPLAY only:
      // the payment buckets below use subTotal (= unitPrice*qty - discount),
      // so the discount is already deducted from cash/gcash/total — we must NOT
      // subtract it again anywhere or it would be double-counted.
      summary.discount += Number(item.discount || 0);
      if (item.paymentMethod === 'Split' && item.paymentSplit) {
        const split = item.paymentSplit as unknown as {
          cash: number; gcash: number; bankTransfer: number;
        };
        summary.cash += Number(split.cash || 0);
        summary.gcash += Number(split.gcash || 0);
        summary.bankTransfer += Number(split.bankTransfer || 0);
      } else {
        const amount = Number(item.subTotal);
        if (item.paymentMethod === 'Cash') summary.cash += amount;
        else if (item.paymentMethod === 'Gcash') summary.gcash += amount;
        else if (item.paymentMethod === 'BankTransfer') summary.bankTransfer += amount;
      }
    }
    summary.total = summary.cash + summary.gcash + summary.bankTransfer;

    return {
      data: sales.map((s) => this.serialize(s)),
      pagination: this.paginate(page, limit, total),
      summary,
    };
  }

  async findOne(id: string, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: this.includeFull(),
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (actor.role === 'Staff') {
      const me = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { branchId: true },
      });
      if (!me?.branchId || sale.branchId !== me.branchId) {
        throw new NotFoundException('Sale not found');
      }
    }
    return this.serialize(sale);
  }

  /**
   * Approve a pending sale. Stock was already reserved at creation, so this
   * just flips the status — nothing to check or deduct here anymore.
   */
  async approve(id: string, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException(`Sale is already ${sale.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomically claim the sale: only one concurrent approve() call can win
      // this conditional update, so a double-click or two admins approving at
      // once can't both succeed.
      const claim = await tx.sale.updateMany({
        where: { id, status: SaleStatus.PENDING },
        data: {
          status: SaleStatus.APPROVED,
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Sale is already approved or declined');
      }

      const updated = await tx.sale.findUnique({
        where: { id },
        include: this.includeFull(),
      });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'SALE_APPROVED',
          entityType: 'Sale',
          entityId: id,
          newValues: { number: sale.number },
        },
      });

      return this.serialize(updated!);
    });
  }

  /**
   * Edit a PENDING sale. Replaces line items (with fresh price snapshots) when
   * `items` is provided, and recomputes the total. Approved/declined sales are
   * immutable. Staff may only edit their own sales. Since stock is reserved
   * at creation, changing quantities means releasing the old reservation and
   * reserving the new one.
   */
  async update(id: string, dto: UpdateSaleDto, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException('Only pending sales can be edited');
    }
    // Who may edit a pending sale:
    //   - Owner: any pending sale.
    //   - Staff: only their OWN pending sale.
    //   - Admin (and any other role): NOT ALLOWED. Admin is an approver/
    //     viewer — it can approve or decline a sale but must never alter its
    //     contents. This route has no controller-level @Roles (Staff need it),
    //     so the restriction is enforced here instead.
    if (actor.role === 'Admin') {
      throw new ForbiddenException('Admins cannot edit sales — only approve or decline them.');
    }
    if (actor.role === 'Staff' && sale.staffId !== actor.userId) {
      throw new ForbiddenException('You can only edit your own sales');
    }

    const data: Prisma.SaleUpdateInput = {};
    if (dto.customerName !== undefined) {
      data.customerName = dto.customerName?.trim() || null;
    }

    let newItems: ReturnType<typeof this.buildSaleItems> | null = null;
    if (dto.items?.length) {
      const productIds = [...new Set(dto.items.map((i) => i.productId))];
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds }, deletedAt: null, brand: { deletedAt: null } },
        include: {
          brand: { select: { name: true } },
          inventory: { where: { branchId: sale.branchId }, select: { sellingPrice: true } },
        },
      });
      if (products.length !== productIds.length) {
        throw new BadRequestException('One or more products are unavailable (archived or from an archived brand).');
      }
      const productMap = new Map(products.map((p) => [p.id, p]));
      const branchPriceMap = new Map(
        products.map((p) => [p.id, p.inventory[0]?.sellingPrice ?? null]),
      );

      newItems = this.buildSaleItems(dto.items, productMap, branchPriceMap);
      data.total = newItems.reduce(
        (sum, i) => sum.add(i.subTotal),
        new Prisma.Decimal(0),
      );
      data.paymentMethod = this.rollupPaymentMethod(newItems);
      // Replace items wholesale.
      data.items = { deleteMany: {}, create: newItems };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (newItems) {
        await this.restoreStock(tx, sale.branchId, sale.items, actor.userId);
        await this.reserveStock(tx, sale.branchId, newItems, actor.userId);
      }

      const result = await tx.sale.update({
        where: { id },
        data,
        include: this.includeFull(),
      });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'SALE_UPDATED',
          entityType: 'Sale',
          entityId: id,
          newValues: { number: sale.number },
        },
      });

      return result;
    });

    return this.serialize(updated);
  }

  async decline(id: string, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException(`Sale is already ${sale.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.sale.updateMany({
        where: { id, status: SaleStatus.PENDING },
        data: {
          status: SaleStatus.DECLINED,
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Sale is already approved or declined');
      }

      // Release the stock that was reserved when this sale was created.
      await this.restoreStock(tx, sale.branchId, sale.items, actor.userId);

      const updated = await tx.sale.findUnique({ where: { id }, include: this.includeFull() });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'SALE_DECLINED',
          entityType: 'Sale',
          entityId: id,
          newValues: { number: sale.number },
        },
      });

      return this.serialize(updated!);
    });
  }

  async remove(id: string, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.status === SaleStatus.APPROVED) {
      throw new BadRequestException('Approved sales cannot be deleted');
    }
    if (actor.role === 'Staff' && sale.staffId !== actor.userId) {
      throw new ForbiddenException('You can only delete your own sales');
    }

    await this.prisma.$transaction(async (tx) => {
      // Only PENDING sales still have their reservation in effect — a
      // DECLINED sale already had its stock restored when it was declined,
      // so restoring again here would double-credit the inventory.
      if (sale.status === SaleStatus.PENDING) {
        await this.restoreStock(tx, sale.branchId, sale.items, actor.userId);
      }
      await tx.sale.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'SALE_DELETED',
          entityType: 'Sale',
          entityId: id,
          newValues: { number: sale.number },
        },
      });
    });

    return { message: 'Sale deleted successfully' };
  }

  /**
   * Build full sale item records (with payment resolved) from DTO input.
   *
   * `branchPriceMap` maps productId -> the branch's own inventory.sellingPrice
   * (when that branch has one). The recorded sale price prefers the per-branch
   * price and falls back to the product's global default only when the branch
   * has no price of its own — mirroring ProductsService.serialize(). This is
   * what makes a sale at, say, Vape City record at that branch's price instead
   * of the product's global default.
   */
  private buildSaleItems(
    dtoItems: { productId: string; quantity: number; discount?: number; paymentMethod: PaymentMethod; bankNote?: string; note?: string; paymentSplit?: { cash: number; gcash: number; bankTransfer: number } }[],
    productMap: Map<string, { id: string; name: string; sellingPrice: Prisma.Decimal; costPrice?: Prisma.Decimal; brand: { name: string } }>,
    branchPriceMap?: Map<string, Prisma.Decimal | null>,
  ) {
    return dtoItems.map((item) => {
      const product = productMap.get(item.productId)!;
      const branchPrice = branchPriceMap?.get(item.productId);
      const unitPrice = new Prisma.Decimal(
        branchPrice != null ? branchPrice : product.sellingPrice,
      );
      const costPrice = new Prisma.Decimal(product.costPrice ?? 0);
      const lineTotal = unitPrice.mul(item.quantity);
      const discount = new Prisma.Decimal(item.discount || 0);
      if (discount.gt(lineTotal)) {
        throw new BadRequestException(
          `Discount for "${product.name}" (${discount.toFixed(2)}) can't exceed its line total (${lineTotal.toFixed(2)})`,
        );
      }
      const subTotal = lineTotal.sub(discount);
      return {
        productId: product.id,
        name: product.name,
        brandName: product.brand.name,
        quantity: item.quantity,
        unitPrice,
        costPrice,
        discount,
        subTotal,
        ...this.resolveItemPayment(item, subTotal, product.name),
      };
    });
  }

  /**
   * Validate and normalize one item's payment fields. For Split, the client
   * supplies cash/gcash/bankTransfer, and the server requires them to add up
   * exactly to the item's subTotal (no leftover) — so the split can't disagree
   * with the amount actually owed.
   */
  private resolveItemPayment(
    item: { paymentMethod: PaymentMethod; bankNote?: string; note?: string; paymentSplit?: { cash: number; gcash: number; bankTransfer: number } },
    subTotal: Prisma.Decimal,
    label: string,
  ) {
    let paymentSplit: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;

    if (item.paymentMethod === 'Split') {
      const s = item.paymentSplit;
      if (!s) {
        throw new BadRequestException(`Split payment amounts are required for "${label}"`);
      }
      const cash = new Prisma.Decimal(s.cash || 0);
      const gcash = new Prisma.Decimal(s.gcash || 0);
      const bankTransfer = new Prisma.Decimal(s.bankTransfer || 0);
      const allocated = cash.add(gcash).add(bankTransfer);
      // A Split must fully allocate across Cash + Gcash + Bank Transfer — no
      // leftover. (There is no "Cashless" remainder any more.) Allow a 0.01
      // tolerance for floating-point rounding.
      if (allocated.sub(subTotal).abs().gt(new Prisma.Decimal('0.01'))) {
        throw new BadRequestException(
          `Split payment for "${label}" must add up to its total (${subTotal.toFixed(2)}) — Cash + Gcash + Bank Transfer.`,
        );
      }
      paymentSplit = {
        cash: cash.toNumber(),
        gcash: gcash.toNumber(),
        bankTransfer: bankTransfer.toNumber(),
      };
    }

    const bankNote =
      item.paymentMethod === 'BankTransfer' || item.paymentMethod === 'Split'
        ? item.bankNote?.trim() || null
        : null;

    return {
      paymentMethod: item.paymentMethod,
      bankNote,
      note: item.note?.trim() || null,
      paymentSplit,
    };
  }

  /** Sale-level rollup: the shared method if every item agrees, else Mixed. */
  private rollupPaymentMethod(items: { paymentMethod: PaymentMethod }[]): PaymentMethod {
    const methods = new Set(items.map((i) => i.paymentMethod));
    return methods.size === 1 ? [...methods][0] : PaymentMethod.Mixed;
  }

  /**
   * Atomically reserve (decrement) stock for each item as a single
   * conditional UPDATE (quantity >= needed), throwing if any item can't be
   * fully reserved. A conditional UPDATE's WHERE clause is re-evaluated
   * against the current row when it acquires the lock, so — unlike a plain
   * read-then-decrement — it can't be fooled by a stale read when multiple
   * reservations for the same product happen concurrently.
   */
  private async reserveStock(
    tx: Prisma.TransactionClient,
    branchId: string,
    items: { productId: string | null; name: string; quantity: number }[],
    userId?: string,
  ) {
    // Perf: previously this did 3 sequential DB round-trips PER item inside the
    // transaction (conditional updateMany + a findUnique to read the new
    // quantity + a stockMovement.create). On a remote DB the latency of those
    // round-trips stacked up and made multi-item saves feel slow. Now each item
    // does ONE atomic statement — a conditional `UPDATE ... RETURNING quantity`
    // — and all the stock-movement rows are inserted together in a single
    // createMany after the loop. Round-trips drop from ~3N to N+1.
    //
    // Correctness is unchanged: the `WHERE quantity >= needed` guard is still
    // re-evaluated under the row lock (so it can't oversell under concurrency),
    // and RETURNING gives the TRUE post-decrement quantity — so the logged
    // quantityAfter stays exactly as accurate as before. A throw mid-loop still
    // rolls back the whole transaction because every statement uses `tx`.
    const movements: Prisma.StockMovementCreateManyInput[] = [];

    for (const item of items) {
      if (!item.productId) continue;

      const rows = await tx.$queryRaw<{ quantity: number }[]>(Prisma.sql`
        UPDATE "inventory"
        SET "quantity" = "quantity" - ${item.quantity}, "updated_at" = NOW()
        WHERE "product_id" = ${item.productId}::uuid
          AND "branch_id" = ${branchId}::uuid
          AND "quantity" >= ${item.quantity}
        RETURNING "quantity"
      `);

      if (rows.length === 0) {
        // Either no inventory row, or not enough stock. Read the current amount
        // (only on the failure path) to give a precise error message.
        const inv = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: item.productId, branchId } },
        });
        throw new BadRequestException(
          `Insufficient stock for "${item.name}" (need ${item.quantity}, have ${inv?.quantity ?? 0})`,
        );
      }

      movements.push({
        productId: item.productId,
        branchId,
        userId: userId ?? null,
        type: 'SALE' as const,
        quantityChange: -item.quantity,
        quantityAfter: Number(rows[0].quantity),
        description: 'Added orders.',
      });
    }

    if (movements.length > 0) {
      await tx.stockMovement.createMany({ data: movements });
    }
  }

  /** Restore (increment) previously-reserved stock for each item. */
  private async restoreStock(
    tx: Prisma.TransactionClient,
    branchId: string,
    items: { productId: string | null; quantity: number }[],
    userId?: string,
  ) {
    // Perf mirror of reserveStock: was 2-3 round-trips per item (upsert +
    // findUnique + stockMovement.create). Now each item is ONE atomic
    // `INSERT ... ON CONFLICT DO UPDATE ... RETURNING quantity`, and the
    // movement rows are inserted together in a single createMany afterwards.
    //
    // The ON CONFLICT keeps the original upsert semantics: if the branch's
    // inventory row was removed while the sale was pending, it's recreated with
    // the restored quantity (id via gen_random_uuid(), matching how Prisma would
    // generate it); otherwise the existing row is incremented. RETURNING gives
    // the true post-increment quantity for an exact quantityAfter.
    const movements: Prisma.StockMovementCreateManyInput[] = [];

    for (const item of items) {
      if (!item.productId) continue;

      const rows = await tx.$queryRaw<{ quantity: number }[]>(Prisma.sql`
        INSERT INTO "inventory" ("id", "product_id", "branch_id", "quantity", "updated_at")
        VALUES (gen_random_uuid(), ${item.productId}::uuid, ${branchId}::uuid, ${item.quantity}, NOW())
        ON CONFLICT ("product_id", "branch_id")
        DO UPDATE SET "quantity" = "inventory"."quantity" + ${item.quantity}, "updated_at" = NOW()
        RETURNING "quantity"
      `);

      movements.push({
        productId: item.productId,
        branchId,
        userId: userId ?? null,
        type: 'RETURN' as const,
        quantityChange: item.quantity,
        quantityAfter: Number(rows[0]?.quantity ?? item.quantity),
        description: 'Restored product quantity after clearing orders.',
      });
    }

    if (movements.length > 0) {
      await tx.stockMovement.createMany({ data: movements });
    }
  }

  /**
   * Atomically claim the next sale number for this branch today. A plain
   * upsert-increment on a (branchId, date) row — concurrent creates for the
   * same branch/day serialize on the row's unique constraint, so two sales
   * can never be handed the same number, and each branch's numbering starts
   * back at 1 every day instead of sharing one global, ever-climbing count.
   */
  private async nextDailyNumber(tx: Prisma.TransactionClient, branchId: string): Promise<number> {
    // Reset per branch on the shop's Philippine BUSINESS day (2 AM -> 2 AM),
    // not calendar midnight. A sale at 1:30 AM PH still belongs to the
    // previous business day, so it keeps counting up from that day's numbers.
    const today = businessDateOnly();
    const counter = await tx.dailySaleCounter.upsert({
      where: { branchId_date: { branchId, date: today } },
      create: { branchId, date: today, count: 1 },
      update: { count: { increment: 1 } },
    });
    return counter.count;
  }

  private async resolveBranchForActor(actor: RequestUser, branchId?: string) {
    if (actor.role === 'Staff') {
      const me = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { branch: { select: { id: true, deletedAt: true } } },
      });
      if (!me?.branch) {
        throw new BadRequestException(
          'Your account is not assigned to a branch. Ask an admin to assign one.',
        );
      }
      // An archived (closed) branch cannot transact.
      if (me.branch.deletedAt) {
        throw new BadRequestException(
          'Your assigned shop is archived. Ask an admin to assign you to an active shop.',
        );
      }
      return me.branch.id;
    }

    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branchId;
  }

  private includeFull() {
    return {
      branch: { select: { id: true, name: true } },
      staff: { select: { id: true, firstName: true, lastName: true, email: true } },
      items: true,
    } satisfies Prisma.SaleInclude;
  }

  private serialize(sale: any) {
    return {
      id: sale.id,
      number: sale.number,
      customerName: sale.customerName,
      branch: sale.branch
        ? { id: sale.branch.id, name: sale.branch.name }
        : null,
      staff: sale.staff
        ? {
            id: sale.staff.id,
            name: `${sale.staff.firstName} ${sale.staff.lastName}`.trim(),
            email: sale.staff.email,
          }
        : null,
      // Rollup of the items' payment methods — the shared method, or Mixed.
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      total: Number(sale.total),
      items: (sale.items ?? []).map((i: any) => ({
        id: i.id,
        productId: i.productId,
        name: i.name,
        brandName: i.brandName,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        discount: Number(i.discount ?? 0),
        subTotal: Number(i.subTotal),
        paymentMethod: i.paymentMethod,
        bankNote: i.bankNote ?? null,
        note: i.note ?? null,
        paymentSplit: i.paymentSplit ?? null,
      })),
      createdAt: sale.createdAt,
      decidedAt: sale.decidedAt,
    };
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
}
