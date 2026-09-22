import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload, RequestUser } from '../../../common/interfaces/request-user.interface';

// Short-lived in-memory cache of validated users, keyed by userId:sessionId.
// validate() runs on EVERY authenticated request and did up to 2 DB queries
// (user + session) each time — a huge fixed cost under the app's polling.
// Caching the validated result for a few seconds collapses a burst of requests
// from the same user into a single DB check, cutting Neon compute sharply.
//
// Trade-off: a role/branch change or a session revocation takes effect after at
// most TTL_MS (not instantly). 10s is a safe, barely-noticeable window; the
// entry is also proactively dropped on logout via `invalidate()`.
const TTL_MS = 10_000;

interface CachedAuth {
  user: RequestUser;
  expiresAt: number;
}

const authCache = new Map<string, CachedAuth>();

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  /** Drop a cached auth entry (call on logout / forced re-auth). */
  static invalidate(userId: string, sessionId?: string) {
    authCache.delete(`${userId}:${sessionId ?? ''}`);
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const cacheKey = `${payload.sub}:${payload.sessionId ?? ''}`;
    const now = Date.now();

    // Fast path: reuse a recent validation (skips both DB queries below).
    const cached = authCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.user;
    }

    // Verify user still exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || !user.isActive || user.isLocked) {
      authCache.delete(cacheKey);
      throw new UnauthorizedException('Invalid token or user account disabled');
    }

    // Verify session still valid if sessionId provided
    if (payload.sessionId) {
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sessionId },
      });

      if (!session || session.expiresAt < new Date()) {
        authCache.delete(cacheKey);
        throw new UnauthorizedException('Session expired');
      }
    }

    const requestUser: RequestUser = {
      userId: user.id,
      email: user.email,
      role: user.role.name,
      sessionId: payload.sessionId,
    };

    // Cache the validated result for a short window. Opportunistically prune
    // expired entries so the map can't grow unbounded over time.
    authCache.set(cacheKey, { user: requestUser, expiresAt: now + TTL_MS });
    if (authCache.size > 500) {
      for (const [k, v] of authCache) {
        if (v.expiresAt <= now) authCache.delete(k);
      }
    }

    return requestUser;
  }
}
