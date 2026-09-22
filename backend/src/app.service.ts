import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  async getHealth() {
    const services: Record<string, string> = { database: 'unknown' };
    let status = 'healthy';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      services.database = 'healthy';
    } catch {
      services.database = 'unreachable';
      return {
        status: 'unhealthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        services,
        hint: 'Cannot connect to PostgreSQL. Check that it is running and DATABASE_URL is correct.',
      };
    }

    // Connection works — verify the schema has been migrated by touching a
    // table the app depends on. A missing table/column means migrations are
    // pending, which is the usual cause of "database error" on every page.
    try {
      await this.prisma.role.count();
      services.schema = 'ready';
    } catch {
      status = 'unhealthy';
      services.schema = 'migrations_pending';
      return {
        status,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        services,
        hint: 'Database schema is out of date. Run `npx prisma migrate deploy` in the backend folder, then `npm run prisma:seed`.',
      };
    }

    return {
      status,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services,
    };
  }

  getVersion() {
    return {
      version: '1.0.0',
      apiVersion: 'v1',
      buildDate: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
