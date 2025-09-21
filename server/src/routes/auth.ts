// server/src/routes/auth.ts
import { Router } from 'express';
import { prisma } from '../prisma';
import {
  createUser,
  verifyUser,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} from '../auth';

const router = Router();

/**
 * POST /auth/register
 * Create a new user. Email/password are optional for now,
 * but if both are provided a password hash will be stored.
 */
router.post('/register', async (req, res) => {
  const { email, password } = req.body ?? {};
  try {
    // createUser() already handles nullable email/password
    const user = await createUser(email ?? null, password ?? '');
    const token = signToken(user.id);
    setAuthCookie(res, token);
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
    });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

/**
 * POST /auth/login
 * Logs a user in if credentials are provided and valid.
 * If email/password are missing, returns 400.
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const user = await verifyUser(email, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user.id);
    setAuthCookie(res, token);
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
    });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

/**
 * POST /auth/logout
 * Clears the auth cookie.
 */
router.post('/logout', async (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

/**
 * GET /auth/me
 * Returns the current user if the cookie is valid.
 */
router.get('/me', requireAuth, async (req: any, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, username: true },
    });
    res.json(user);
  } catch (err) {
    console.error('me error', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
