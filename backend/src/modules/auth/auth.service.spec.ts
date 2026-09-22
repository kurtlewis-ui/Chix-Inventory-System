import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../common/upload/upload.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: JwtService;

  const mockUser = {
    id: 'user-uuid',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    firstName: 'Test',
    lastName: 'User',
    roleId: 'role-uuid',
    isActive: true,
    isLocked: false,
    failedLoginAttempts: 0,
    mustChangePassword: false,
    role: { id: 'role-uuid', name: 'Staff' },
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      session: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                JWT_SECRET: 'secret',
                JWT_REFRESH_SECRET: 'refresh-secret',
                JWT_EXPIRATION: '15m',
                JWT_REFRESH_EXPIRATION: '7d',
                SESSION_TIMEOUT: '900',
                BCRYPT_ROUNDS: '12',
              };
              return config[key];
            }),
          },
        },
        {
          provide: UploadService,
          useValue: { uploadDataUrl: jest.fn(async (v: unknown) => v), isConfigured: jest.fn(() => false) },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should throw UnauthorizedException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login(
          { email: 'nobody@example.com', password: 'password' },
          '127.0.0.1',
          'jest',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException when account is locked', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, isLocked: true });

      await expect(
        service.login(
          { email: mockUser.email, password: 'password' },
          '127.0.0.1',
          'jest',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when account is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(
        service.login(
          { email: mockUser.email, password: 'password' },
          '127.0.0.1',
          'jest',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(
        service.login(
          { email: mockUser.email, password: 'wrong' },
          '127.0.0.1',
          'jest',
        ),
      ).rejects.toThrow(UnauthorizedException);

      // Failed attempt should be recorded
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('should return tokens on successful login', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-token' as never);
      prisma.session.create.mockResolvedValue({ id: 'session-uuid', tokenVersion: 1 });
      prisma.session.update.mockResolvedValue({});
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.login(
        { email: mockUser.email, password: 'correct' },
        '127.0.0.1',
        'jest',
      );

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(mockUser.email);
    });
  });

  describe('changePassword', () => {
    it('should throw BadRequestException when passwords do not match', async () => {
      await expect(
        service.changePassword('user-uuid', {
          currentPassword: 'old',
          newPassword: 'NewPass123!',
          confirmPassword: 'Different123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException when current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(
        service.changePassword('user-uuid', {
          currentPassword: 'wrong',
          newPassword: 'NewPass123!',
          confirmPassword: 'NewPass123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
