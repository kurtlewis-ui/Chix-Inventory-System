import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtPayload, JwtRefreshPayload } from '../../common/interfaces/request-user.interface';
import { UploadService } from '../../common/upload/upload.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private upload: UploadService,
  ) {}

  async login(loginDto: LoginDto, ipAddress: string, userAgent: string) {
    const { email, password } = loginDto;

    // Find user with role
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: true, branch: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is active
    if (!user.isActive) {
      throw new ForbiddenException('Account is disabled');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      // Increment failed attempts
      await this.handleFailedLogin(user.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on successful login
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        isLocked: false,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });

    // Create session
    const session = await this.createSession(user.id, ipAddress, userAgent);

    // Generate tokens
    const accessToken = this.generateAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role.name,
      sessionId: session.id,
    });

    const refreshToken = this.generateRefreshToken({
      sub: user.id,
      sessionId: session.id,
      tokenVersion: session.tokenVersion,
    });

    // Hash and store refresh token
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash },
    });

    // Create audit log
    await this.createAuditLog(user.id, 'LOGIN', ipAddress, userAgent);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: {
          id: user.role.id,
          name: user.role.name,
        },
        branch: user.branch
          ? { id: user.branch.id, name: user.branch.name }
          : null,
        avatarUrl: user.avatarUrl ?? null,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async logout(userId: string, sessionId: string) {
    // Delete session
    await this.prisma.session.delete({
      where: { id: sessionId },
    });

    // Drop this session from the JWT auth cache so logout takes effect
    // immediately rather than after the cache TTL.
    JwtStrategy.invalidate(userId, sessionId);

    // Create audit log
    await this.createAuditLog(userId, 'LOGOUT', null, null);

    return { message: 'Logged out successfully' };
  }

  async refreshToken(userId: string, sessionId: string, ipAddress: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, branch: true },
    });

    if (!user || !user.isActive || user.isLocked) {
      throw new UnauthorizedException('Invalid user');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new UnauthorizedException('Session not found');
    }

    // Update session last activity and slide the idle-timeout window forward.
    // Without this, `expiresAt` (set once at login) is reached ~15 minutes in
    // regardless of activity, and every subsequent request/refresh gets
    // rejected by JwtStrategy/JwtRefreshStrategy's `expiresAt < now` check.
    const sessionTimeout = parseInt(this.config.get<string>('SESSION_TIMEOUT') ?? '28800', 10) || 28800;
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: new Date(),
        expiresAt: new Date(Date.now() + sessionTimeout * 1000),
        ipAddress,
      },
    });

    // Generate new access token
    const accessToken = this.generateAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role.name,
      sessionId: session.id,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: {
          id: user.role.id,
          name: user.role.name,
        },
        branch: user.branch
          ? { id: user.branch.id, name: user.branch.name }
          : null,
        avatarUrl: user.avatarUrl ?? null,
      },
    };
  }

  /** Return the current user's full profile. */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, branch: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.serializeUser(user);
  }

  /** Update the current user's own profile (name, email, photo). */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id: userId } },
      });
      if (existing) {
        throw new BadRequestException('That email is already in use');
      }
    }

    const data: any = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.middleInitial !== undefined) data.middleInitial = dto.middleInitial.trim() || null;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.avatarUrl !== undefined) {
      data.avatarUrl = (await this.upload.uploadDataUrl(dto.avatarUrl || null, 'avatars')) ?? null;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: { role: true, branch: true },
    });

    await this.createAuditLog(userId, 'PROFILE_UPDATED', null, null);

    return this.serializeUser(user);
  }

  private serializeUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      middleInitial: user.middleInitial ?? null,
      avatarUrl: user.avatarUrl ?? null,
      role: { id: user.role.id, name: user.role.name },
      branch: user.branch ? { id: user.branch.id, name: user.branch.name } : null,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword, confirmPassword } = changePasswordDto;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('New passwords do not match');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Check if new password is same as old
    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    // Hash new password
    const bcryptRounds = parseInt(this.config.get<string>('BCRYPT_ROUNDS') ?? '12', 10) || 12;
    const newPasswordHash = await bcrypt.hash(newPassword, bcryptRounds);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    });

    // Invalidate all sessions except current (force re-login)
    await this.prisma.session.deleteMany({
      where: {
        userId,
      },
    });

    // Create audit log
    await this.createAuditLog(userId, 'PASSWORD_CHANGED', null, null);

    return { message: 'Password changed successfully. Please login again.' };
  }

  private async handleFailedLogin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return;
    }

    // Track failed attempts for auditing only. The account is never locked,
    // so login attempts are unlimited.
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: user.failedLoginAttempts + 1,
      },
    });

    // Create audit log for failed login
    await this.createAuditLog(userId, 'LOGIN_FAILED', null, null);
  }

  private async createSession(userId: string, ipAddress: string, userAgent: string) {
    // Idle session window. Defaults to 8 hours so a staff member isn't logged
    // out mid-shift; slides forward on every refresh (see refreshToken).
    const sessionTimeout = parseInt(this.config.get<string>('SESSION_TIMEOUT') ?? '28800', 10) || 28800; // 8 hours
    const expiresAt = new Date(Date.now() + sessionTimeout * 1000);

    return this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: '', // Will be updated after token generation
        ipAddress,
        userAgent,
        expiresAt,
      },
    });
  }

  private generateAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRATION') || '60m',
    });
  }

  private generateRefreshToken(payload: JwtRefreshPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRATION') || '7d',
    });
  }

  private async createAuditLog(
    userId: string,
    action: string,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType: 'User',
        entityId: userId,
        ipAddress,
        userAgent,
      },
    });
  }
}
