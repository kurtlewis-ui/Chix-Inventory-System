import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../common/upload/upload.service';

/**
 * Unit tests for the permission rules in UsersService — the "who can manage
 * whom" guards. These protect against privilege escalation: an Admin must only
 * ever manage Staff (never create/edit/delete/restore/reset an Owner or a peer
 * Admin, and never assign a non-Staff role). An Owner can manage anyone (but
 * can't delete their own account). Mocked Prisma — no database.
 */
const OWNER_ROLE = 'Owner';
const ADMIN_ROLE = 'Admin';

describe('UsersService — permissions', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      role: { findUnique: jest.fn() },
      branch: { findFirst: jest.fn() },
      session: { deleteMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: { get: jest.fn(() => '12') } },
        { provide: UploadService, useValue: { uploadDataUrl: jest.fn(async (v: unknown) => v) } },
      ],
    }).compile();

    service = module.get(UsersService);
    prisma = module.get(PrismaService);
  });

  // ---- create --------------------------------------------------------------
  describe('create', () => {
    it('forbids an Admin from creating a non-Staff (Admin) account', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // email free
      prisma.role.findUnique.mockResolvedValue({ id: 'r-admin', name: 'Admin' });

      await expect(
        service.create(
          { email: 'x@x.com', password: 'p', firstName: 'A', lastName: 'B', roleId: 'r-admin' } as any,
          'admin-1',
          ADMIN_ROLE,
        ),
      ).rejects.toThrow(/only create Staff/i);
    });

    it('forbids an Admin from creating an Owner account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 'r-owner', name: 'Owner' });

      await expect(
        service.create(
          { email: 'x@x.com', password: 'p', firstName: 'A', lastName: 'B', roleId: 'r-owner' } as any,
          'admin-1',
          ADMIN_ROLE,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows an Owner to create an Admin account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 'r-admin', name: 'Admin' });
      prisma.user.create.mockResolvedValue({
        id: 'new-1', email: 'x@x.com', firstName: 'A', lastName: 'B',
        role: { id: 'r-admin', name: 'Admin' }, branch: null, passwordHash: 'h',
      });

      const res = await service.create(
        { email: 'x@x.com', password: 'p', firstName: 'A', lastName: 'B', roleId: 'r-admin' } as any,
        'owner-1',
        OWNER_ROLE,
      );
      expect(res).toHaveProperty('id', 'new-1');
      // Password hash is never returned.
      expect(res as any).not.toHaveProperty('passwordHash');
    });
  });

  // ---- update --------------------------------------------------------------
  describe('update', () => {
    it('forbids an Admin from editing an Owner', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', isActive: true, roleId: 'r-owner', role: { name: 'Owner' } });
      await expect(
        service.update('u1', { firstName: 'New' } as any, 'admin-1', ADMIN_ROLE),
      ).rejects.toThrow(/only manage Staff/i);
    });

    it('forbids an Admin from editing a peer Admin', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', isActive: true, roleId: 'r-admin', role: { name: 'Admin' } });
      await expect(
        service.update('u1', { firstName: 'New' } as any, 'admin-1', ADMIN_ROLE),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids an Admin from promoting a Staff to a non-Staff role', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', isActive: true, roleId: 'r-staff', role: { name: 'Staff' } });
      prisma.role.findUnique.mockResolvedValue({ id: 'r-admin', name: 'Admin' });
      await expect(
        service.update('u1', { roleId: 'r-admin' } as any, 'admin-1', ADMIN_ROLE),
      ).rejects.toThrow(/only assign the Staff role/i);
    });
  });

  // ---- resetPassword -------------------------------------------------------
  describe('resetPassword', () => {
    it('forbids an Admin from resetting an Owner password', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', role: { name: 'Owner' } });
      await expect(
        service.resetPassword('u1', 'NewPass123!', 'NewPass123!', 'admin-1', ADMIN_ROLE),
      ).rejects.toThrow(/only reset Staff/i);
    });

    it('rejects mismatched new passwords', async () => {
      await expect(
        service.resetPassword('u1', 'NewPass123!', 'Different123!', 'owner-1', OWNER_ROLE),
      ).rejects.toThrow(/do not match/i);
    });
  });

  // ---- remove --------------------------------------------------------------
  describe('remove', () => {
    it('forbids an Admin from deleting a peer Admin', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', role: { name: 'Admin' } });
      await expect(service.remove('u1', 'admin-1', ADMIN_ROLE)).rejects.toThrow(/only delete Staff/i);
    });

    it('prevents an Owner from deleting their own account', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'owner-1', role: { name: 'Owner' } });
      await expect(service.remove('owner-1', 'owner-1', OWNER_ROLE)).rejects.toThrow(/your own account/i);
    });
  });

  // ---- restore -------------------------------------------------------------
  describe('restore', () => {
    it('forbids an Admin from restoring an Owner', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', deletedAt: new Date(), role: { name: 'Owner' } });
      await expect(service.restore('u1', 'admin-1', ADMIN_ROLE)).rejects.toThrow(/only restore Staff/i);
    });
  });

  // ---- findAll visibility --------------------------------------------------
  describe('findAll — visibility', () => {
    it('hides Owner accounts from a non-Owner (Admin) via the where clause', async () => {
      prisma.user.count = jest.fn().mockResolvedValue(0);
      prisma.user.findMany = jest.fn().mockResolvedValue([]);
      await service.findAll({} as any, ADMIN_ROLE);
      // The query must restrict roles to Admin + Staff only (never Owner).
      const whereArg = prisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.role).toEqual({ name: { in: ['Admin', 'Staff'] } });
    });

    it('does not restrict roles for an Owner', async () => {
      prisma.user.count = jest.fn().mockResolvedValue(0);
      prisma.user.findMany = jest.fn().mockResolvedValue([]);
      await service.findAll({} as any, OWNER_ROLE);
      const whereArg = prisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.role).toBeUndefined();
    });
  });
});
