// server/src/auth.ts
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

const COOKIE_NAME = process.env.COOKIE_NAME || 'fin_auth';
const JWT_SECRET  = process.env.JWT_SECRET  || 'dev-secret';
const IS_PROD     = process.env.NODE_ENV === 'production';

export type JwtPayload = { uid: string };

// ---- tokens & cookies ----
export function signToken(uid: string) {
  return jwt.sign({ uid } as JwtPayload, JWT_SECRET, { expiresIn: '30d' });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,                    // must be true on HTTPS
    sameSite: IS_PROD ? 'none' : 'lax', // cross-site in prod if frontend on different origin
    maxAge: 30 * 24 * 60 * 60 * 1000,   // 30 days
    path: '/',
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
    path: '/',
  });
}

// ---- middleware ----
// Use RequestHandler so Express types line up, and avoid throwing 500s when token is bad.
export const requireAuth: RequestHandler = (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Unauthenticated' });

    const data = jwt.verify(token, JWT_SECRET) as JwtPayload;
    // relies on express type augmentation (req.userId?: string)
    (req as any).userId = data.uid; // safe even if you haven’t added the augmentation yet
    return next();
  } catch {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
};

// ---- user helpers (matches your schema: model `users`, snake_case fields) ----
/**
 * Create a user. For testing, email and password may be omitted.
 * If password is provided, we hash it into `password_hash`.
 */
export async function createUser(email?: string | null, password?: string) {
  const password_hash = password ? await bcrypt.hash(password, 12) : null;
  const username =
    (email && email.includes('@')) ? email.split('@')[0] : undefined;

  const user = await prisma.users.create({
    data: {
      email: email ?? null,
      username: username ?? null,
      password_hash, // may be null for test users
    },
  });

  return user;
}

/**
 * Verify a user by email/password. Returns user on success, null otherwise.
 * (Email is nullable in schema, so we use findFirst.)
 */
export async function verifyUser(email: string, password: string) {
  const user = await prisma.users.findFirst({ where: { email } });
  if (!user || !user.password_hash) return null;

  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? user : null;
}
