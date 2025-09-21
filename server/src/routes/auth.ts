// server/src/routes/auth.ts
import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import {
  createUser,
  verifyUser,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} from '../auth';

// tiny async wrapper so errors hit your errorHandler
const ah =
  <T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) =>
  (req: Request, res: Response) =>
    fn(req, res).catch((err) => {
      // let your centralized error middleware handle it
      throw err;
    });

const router = Router();

/**
 * POST /auth/register
 * Create a new user. Email/password are optional for now.
 */
router.post(
  '/register',
  ah(async (req, res) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    const user = await createUser(email ?? null, password ?? '');
    const token = signToken(user.id);
    setAuthCookie(res, token);
    res.json({ id: user.id, email: user.email, username: user.username });
  })
);

/**
 * POST /auth/login
 */
router.post(
  '/login',
  ah(async (req, res) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await verifyUser(email, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user.id);
    setAuthCookie(res, token);
    res.json({ id: user.id, email: user.email, username: user.username });
  })
);

/**
 * POST /auth/logout
 */
router.post(
  '/logout',
  ah(async (_req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  })
);

/**
 * GET /auth/me
 */
router.get(
  '/me',
  requireAuth,
  ah(async (req: Request & { userId: string }, res) => {
    const user = await prisma.users.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, username: true },
    });
    res.json(user);
  })
);

export default router;
