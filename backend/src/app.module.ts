import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BranchesModule } from './modules/branches/branches.module';
import { BrandsModule } from './modules/brands/brands.module';
import { ProductsModule } from './modules/products/products.module';
import { SalesModule } from './modules/sales/sales.module';
import { DisposalsModule } from './modules/disposals/disposals.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module';
import { StatsModule } from './modules/stats/stats.module';
import { StockMovementsModule } from './modules/stock-movements/stock-movements.module';
import { UploadModule } from './common/upload/upload.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting (values in milliseconds for ttl)
    ThrottlerModule.forRoot([
      {
        ttl: (parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10) || 60) * 1000,
        limit: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10) || 100,
      },
    ]),

    // Database
    PrismaModule,

    // Global image upload (Cloudinary) — available to all feature modules.
    UploadModule,

    // Feature modules
    AuthModule,
    UsersModule,
    BranchesModule,
    BrandsModule,
    ProductsModule,
    SalesModule,
    DisposalsModule,
    ExpensesModule,
    ActivityLogsModule,
    StatsModule,
    StockMovementsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
