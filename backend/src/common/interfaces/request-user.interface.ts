export interface RequestUser {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
  iat?: number;
  exp?: number;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  sessionId?: string;
}

export interface JwtRefreshPayload {
  sub: string;
  sessionId: string;
  tokenVersion: number;
}
