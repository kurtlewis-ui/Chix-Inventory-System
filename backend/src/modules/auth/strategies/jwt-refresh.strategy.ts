import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtRefreshPayload } from '../../../common/interfaces/request-user.interface';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.refreshToken;
        },
      ]),
      secretOrKey: config.get('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
      ignoreExpiration: false,
    });
  }

  async validate(req: Request, payload: JwtRefreshPayload) {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    // Verify session exists and matches
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: { include: { role: true } } },
    });

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check session expiration
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    // Check token version (for forced logout)
    if (session.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Token has been invalidated');
    }

    // Check user status
    if (!session.user.isActive || session.user.isLocked) {
      throw new UnauthorizedException('User account disabled');
    }

    return {
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role.name,
      sessionId: session.id,
    };
  }
}
