import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryActivityLogDto } from './dto/query-activity-log.dto';

// Maps an audit-log entityType to the UI "category"/"module" used by the
// Activity Logs page tabs.
const ENTITY_CATEGORY: Record<string, string> = {
  Auth: 'Authentications',
  Session: 'Authentications',
  Branch: 'Shops',
  Product: 'Products',
  Brand: 'Brands',
  Sale: 'Reports',
  User: 'Users',
};

// Login/session actions are logged with entityType 'User' (there's no
// separate 'Auth'/'Session' entityType in practice), so they need to be
// pulled into "Authentications" by action name rather than entityType alone
// - otherwise that tab can never match anything.
const AUTH_ACTIONS = new Set(['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGED']);

@Injectable()
export class ActivityLogsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryActivityLogDto) {
    const { page = 1, limit = 20, search, category, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (category === 'Authentications') {
      where.entityType = 'User';
      where.action = { in: [...AUTH_ACTIONS] };
    } else if (category === 'Users') {
      where.entityType = 'User';
      where.action = { notIn: [...AUTH_ACTIONS] };
    } else if (category && category !== 'All') {
      const entityTypes = Object.entries(ENTITY_CATEGORY)
        .filter(([, cat]) => cat === category)
        .map(([entity]) => entity);
      if (entityTypes.length) {
        where.entityType = { in: entityTypes };
      }
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entityType: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: logs.map((log) => this.serialize(log)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  private serialize(log: any) {
    const category =
      log.entityType === 'User' && AUTH_ACTIONS.has(log.action)
        ? 'Authentications'
        : (ENTITY_CATEGORY[log.entityType] ?? 'Accounts');
    const action = this.humanizeAction(log.action);
    return {
      id: log.id,
      userName: log.user
        ? `${log.user.firstName} ${log.user.lastName}`.trim()
        : 'System',
      userEmail: log.user?.email ?? '',
      action,
      module: category,
      category,
      description: this.buildDescription(action, log),
      device: this.parseDevice(log.userAgent),
      ipAddress: log.ipAddress ?? 'N/A',
      date: log.createdAt,
    };
  }

  private humanizeAction(action: string): string {
    // 'BRAND_CREATED' -> 'Brand Created'
    return action
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private buildDescription(action: string, log: any): string {
    const values = log.newValues ?? log.oldValues ?? null;
    const name =
      values && typeof values === 'object'
        ? values.name || values.email || values.number
        : null;
    return name ? `${action}: ${name}` : action;
  }

  private parseDevice(userAgent?: string | null): string {
    if (!userAgent) return 'Unknown';
    const browser =
      /Edg/.test(userAgent)
        ? 'Edge'
        : /Chrome/.test(userAgent)
          ? 'Chrome'
          : /Firefox/.test(userAgent)
            ? 'Firefox'
            : /Safari/.test(userAgent)
              ? 'Safari'
              : 'Unknown browser';
    const os =
      /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Android/.test(userAgent)
            ? 'Android'
            : /iPhone|iPad|iOS/.test(userAgent)
              ? 'iOS'
              : /Linux/.test(userAgent)
                ? 'Linux'
                : 'Unknown OS';
    return `${browser} / ${os}`;
  }
}
