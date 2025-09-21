// server/src/index.ts
import * as dotenv from 'dotenv';
dotenv.config();

import { z } from 'zod';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { withRequestId, log } from './middleware/logger';  // ✅ add this
import { errorHandler } from './middleware/errors';        // ✅ add this later
import forecastRoutes from './routes/forecast';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { incomeSchema, txnSchema, changePasswordSchema, assumptionsSchema } from './validators';
import {
  requireAuth,
  createUser,
  verifyUser,
  signToken,
  setAuthCookie,
  clearAuthCookie,
} from './auth';

const app = express();
app.use(withRequestId);
app.use(cors({
  origin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  credentials: true, // allow cookies
}));
app.use(express.json());
app.use(cookieParser());

// --- helper: month range from "YYYY-MM" ---
// --- helper: strict month range from "YYYY-MM" ---
function monthRange(yyyyMm: string) {
  if (!/^\d{4}-\d{2}$/.test(yyyyMm)) {
    throw Object.assign(new Error('Invalid month. Use YYYY-MM.'), { status: 400 });
  }
  const [y, m] = yyyyMm.split('-').map(Number);
  if (m < 1 || m > 12) {
    throw Object.assign(new Error('Invalid month. Use YYYY-MM.'), { status: 400 });
  }
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end   = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  return { start, end };
}


// add near other validators
const billCreateSchema = z.object({
  name: z.string().min(1),

  // Accept either amount_cents (preferred) or amount (dollars)
  amount_cents: z.number().int().nonnegative().optional(),
  amount: z.number().nonnegative().optional(),

  cadence: z.enum(['weekly','biweekly','monthly','quarterly','annual','once']),
  type: z.enum(['bill','subscription']).default('bill'),

  due_day: z.number().int().min(1).max(31).optional().nullable(),

  // Be flexible: accept YYYY-MM-DD or full ISO; allow undefined/null
  start_date: z.coerce.date().optional().nullable(),
  end_date: z.coerce.date().optional().nullable(),

  payment_method: z.enum(['credit','debit','cash','ach']).optional().nullable(),
  notes: z.string().max(10_000).optional().nullable(),
})
  // require at least one of amount_cents or amount
  .refine(d => d.amount_cents !== undefined || d.amount !== undefined, {
    message: 'Provide amount_cents or amount',
    path: ['amount'],
  })
  // normalize to amount_cents for the DB
  .transform(d => ({
    ...d,
    amount_cents:
      d.amount_cents ?? Math.round((d.amount ?? 0) * 100),
  }));


/* =========================
   Auth routes
   ========================= */

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'Email and password (>= 6 chars) required' });
  }

  const normalized = String(email).toLowerCase();
  const existing = await prisma.users.findFirst({ where: { email: normalized } });
  if (existing) return res.status(400).json({ error: 'Email already registered' });

  const user = await createUser(normalized, String(password));
  const token = signToken(user.id);
  setAuthCookie(res, token);
  res.json({ ok: true, user: { id: user.id, email: user.email } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await verifyUser(String(email).toLowerCase(), String(password));
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(user.id);
  setAuthCookie(res, token);
  res.json({ ok: true, user: { id: user.id, email: user.email } });
});

app.post('/api/logout', async (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, async (req: any, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthenticated' });

  const u = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true },
  });

  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({ id: u.id, email: u.email, username: u.username });
});


/* =========================
   Settings
   ========================= */

// Change password (allows blank current if user has no password yet)
app.post('/api/settings/password', requireAuth, async (req: any, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const u = await prisma.users.findUnique({ where: { id: req.userId } });
  if (!u) return res.status(404).json({ error: 'User not found' });

  if (u.password_hash) {
    const ok = await bcrypt.compare(parsed.data.currentPassword || '', u.password_hash);
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.users.update({ where: { id: u.id }, data: { password_hash: newHash } });
  res.json({ ok: true });
});

// Read assumptions (current savings, etc.)
app.get('/api/settings/assumptions', requireAuth, async (req: any, res) => {
  const a = await prisma.assumptions.findUnique({ where: { user_id: req.userId } });
  res.json(a || null);
});

// Upsert assumptions
app.put('/api/settings/assumptions', requireAuth, async (req: any, res) => {
  const parsed = assumptionsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const cents = Math.round(parsed.data.currentSavings * 100);
  const asOf  = new Date(parsed.data.asOfDate);

  const row = await prisma.assumptions.upsert({
    where: { user_id: req.userId },
    update: {
      current_savings_cents: cents,
      as_of_date: asOf,
      savings_apr: parsed.data.apr ?? undefined,
      inflation_pct: parsed.data.inflation ?? undefined,
    },
    create: {
      user_id: req.userId,
      current_savings_cents: cents,
      as_of_date: asOf,
      savings_apr: parsed.data.apr ?? 0,
      inflation_pct: parsed.data.inflation ?? 0,
    }
  });
  res.json(row);
});

/* =========================
   Health
   ========================= */

app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* =========================
   Categories & merchants
   ========================= */

app.get('/api/categories', requireAuth, async (_req, res) => {
  const cats = await prisma.categories.findMany({ orderBy: { name: 'asc' } });
  res.json(cats);
});

app.get('/api/merchants', requireAuth, async (_req, res) => {
  const ms = await prisma.merchants.findMany({ orderBy: { name: 'asc' } });
  res.json(ms);
});

app.post('/api/merchants', requireAuth, async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const m = await prisma.merchants.upsert({
    where: { name }, update: {}, create: { name }
  });
  res.json(m);
});

/* =========================
   Income
   ========================= */

app.post('/api/income', requireAuth, async (req: any, res) => {
  const parsed = incomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const cents = Math.round(parsed.data.amount * 100);
  const row = await prisma.income.create({
    data: {
      user_id: req.userId,
      date: new Date(parsed.data.date),
      amount_cents: cents,
      source: parsed.data.source,
      category_id: parsed.data.categoryId || null,
      notes: parsed.data.notes || null
    }
  });
  res.json(row);
});

app.get('/api/income', requireAuth, async (req: any, res) => {
  try {
    const month = String(req.query.month || '');
    const { start, end } = monthRange(month);
    const rows = await prisma.income.findMany({
      where: { user_id: req.userId, date: { gte: start, lt: end } },
      orderBy: { date: 'asc' }
    });
    res.json(rows);
  } catch (e: any) {
    const status = e?.status ?? 500;
    res.status(status).json({ error: e?.message || 'Failed to fetch income' });
  }
});

/* =========================
   Transactions (spending)
   ========================= */

app.post('/api/transactions', requireAuth, async (req: any, res) => {
  const parsed = txnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const cents = Math.round(parsed.data.amount * 100);
  const row = await prisma.transactions.create({
    data: {
      user_id: req.userId,
      date: new Date(parsed.data.date),
      amount_cents: cents,
      merchant_id: parsed.data.merchantId || null,
      merchant_name: parsed.data.merchantName || null,
      category_id: parsed.data.categoryId || null,
      method: parsed.data.method, // 'credit' | 'debit' | 'cash' | 'ach'
      notes: parsed.data.notes || null
    }
  });
  res.json(row);
});

app.get('/api/transactions', requireAuth, async (req: any, res) => {
  try {
    const month = String(req.query.month || '');
    const { start, end } = monthRange(month);
    const rows = await prisma.transactions.findMany({
      where: { user_id: req.userId, date: { gte: start, lt: end } },
      orderBy: { date: 'asc' }
    });
    res.json(rows);
  } catch (e: any) {
    const status = e?.status ?? 500;
    res.status(status).json({ error: e?.message || 'Failed to fetch transactions' });
  }
});

/* =========================
   Monthly overview (DB view)
   ========================= */

app.get('/api/overview', requireAuth, async (_req, res) => {
  const month = String((_req as any).query?.month || '');
  const rows = await prisma.$queryRaw<
    { month_key: string; income: number; fixed_expenses: number; flexible_expenses: number }[]
  >`SELECT * FROM app.monthly_overview WHERE month_key = ${month}`;
  res.json(rows);
});

/* =========================
   Forecast to Dec 2027
   ========================= */

// /api/forecast: robust, no DB view required
app.get('/api/forecast', requireAuth, async (req: any, res) => {
  try {
    // start key defaults to current UTC month if not provided
    const startKey = String(req.query.start || new Date().toISOString().slice(0,7)); // "YYYY-MM"
    if (!/^\d{4}-\d{2}$/.test(startKey)) {
      return res.status(400).json({ error: 'start must be YYYY-MM' });
    }

    // assumptions required
    const a = await prisma.assumptions.findUnique({ where: { user_id: req.userId } });
    if (!a) return res.status(400).json({ error: 'Set assumptions first (current savings & as_of_date).' });

    const toKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;

    // compute month list from max(as_of_date, startKey) through Dec 2027
    const asOf = new Date(Date.UTC(a.as_of_date.getUTCFullYear(), a.as_of_date.getUTCMonth(), 1));
    const startParts = startKey.split('-').map(Number);
    const requested = new Date(Date.UTC(startParts[0], startParts[1]-1, 1));
    const first = requested < asOf ? asOf : requested;
    const end = new Date(Date.UTC(2027, 11, 1)); // Dec 2027

    // Query aggregates per month via SQL (safe, no custom view needed)
    // Income per month
    const incRows: { month_key: string; cents: bigint }[] = await prisma.$queryRaw`
      SELECT to_char(date, 'YYYY-MM') AS month_key, SUM(amount_cents)::bigint AS cents
      FROM "app"."income"
      WHERE user_id = ${req.userId}::uuid
      GROUP BY 1
    `;

    // Spending per month (transactions)
    const spendRows: { month_key: string; cents: bigint }[] = await prisma.$queryRaw`
      SELECT to_char(date, 'YYYY-MM') AS month_key, SUM(amount_cents)::bigint AS cents
      FROM "app"."transactions"
      WHERE user_id = ${req.userId}::uuid
      GROUP BY 1
    `;

    const incomeByMonth = new Map<string, number>();
    for (const r of incRows) incomeByMonth.set(r.month_key, Number(r.cents));

    const spendByMonth = new Map<string, number>();
    for (const r of spendRows) spendByMonth.set(r.month_key, Number(r.cents));

    // Walk months and build the forecast from assumptions.current_savings_cents
    const out: { month_key: string; net_change_cents: number; savings_cents: number }[] = [];
    let running = a.current_savings_cents;

    let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    while (cursor <= end) {
      const key = toKey(cursor);
      const inc  = incomeByMonth.get(key) ?? 0;
      const exp  = spendByMonth.get(key) ?? 0;
      const net  = inc - exp; // cents
      running += net;
      out.push({ month_key: key, net_change_cents: net, savings_cents: running });
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth()+1, 1));
    }

    res.json(out);
  } catch (e: any) {
    // If something DB-specific goes wrong, don’t leak raw error; give a stable message.
    res.status(500).json({ error: 'Failed to build forecast' });
  }
});


/* =========================
   Bills (recurring)
   ========================= */

// GET /api/bills
// default: only 'bill'; override with ?type=subscription or ?type=all
app.get('/api/bills', requireAuth, async (req: any, res) => {
  try {
    const qType = String(req.query.type || 'bill'); // 'bill' | 'subscription' | 'all'

    const where =
      qType === 'all'
        ? { user_id: req.userId }
        : qType === 'subscription'
          ? { user_id: req.userId, type: 'subscription' as const }
          : { user_id: req.userId, type: 'bill' as const };

    const rows = await prisma.bills.findMany({ where, orderBy: { name: 'asc' } });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/bills error', err);
    res.status(500).json({ error: 'Failed to load bills' });
  }
});

// Strict subscriptions endpoint (nice for the Subscriptions page)
app.get('/api/subscriptions', requireAuth, async (req: any, res) => {
  const rows = await prisma.bills.findMany({
    where: { user_id: req.userId, type: 'subscription' },
    orderBy: { name: 'asc' },
  });
  res.json(rows);
});

// POST /api/bills — now validates and accepts `type`
app.post('/api/bills', requireAuth, async (req: any, res) => {
  // validate everything except userId
  const parsed = billCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;

  try {
    const row = await prisma.bills.create({
      data: {
        user_id: req.userId,      // ✅ comes from auth middleware
        name: d.name,
        amount_cents: d.amount_cents,
        cadence: d.cadence,
        type: d.type,
        due_day: d.due_day,
        start_date: d.start_date,
        end_date: d.end_date,
        payment_method: d.payment_method,
        notes: d.notes,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    console.error('Create bill failed:', e);
    res.status(500).json({ error: 'Failed to create bill' });
  }
});

app.delete('/api/bills/:id', requireAuth, async (req: any, res) => {
  const del = await prisma.bills.deleteMany({
    where: { id: String(req.params.id), user_id: req.userId },
  });
  if (del.count === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Update the type of a bill (e.g., mark subscription back to bill)
app.patch('/api/bills/:id', requireAuth, async (req: any, res) => {
  const { type } = req.body;
  if (type !== 'bill' && type !== 'subscription') {
    return res.status(400).json({ error: 'type must be "bill" or "subscription"' });
  }

  try {
    const updated = await prisma.bills.updateMany({
      where: { id: req.params.id, user_id: req.userId },
      data: { type },
    });
    if (updated.count === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/bills/:id error', err);
    res.status(500).json({ error: 'Failed to update bill type' });
  }
});



/* =========================
   Monthly totals for dashboard tiles
   ========================= */

app.get('/api/summary', requireAuth, async (req: any, res) => {
  try {
    const month = String(req.query.month || '');
    const { start, end } = monthRange(month);

    const [inc, spend] = await Promise.all([
      prisma.income.aggregate({
        _sum: { amount_cents: true },
        where: { user_id: req.userId, date: { gte: start, lt: end } }
      }),
      prisma.transactions.aggregate({
        _sum: { amount_cents: true },
        where: { user_id: req.userId, date: { gte: start, lt: end } }
      })
    ]);

    const incomeCents = inc._sum.amount_cents ?? 0;
    const spendCents  = spend._sum.amount_cents ?? 0;

    res.json({
      month,
      income: incomeCents / 100,
      spending: spendCents / 100,
      net: (incomeCents - spendCents) / 100
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    res.status(status).json({ error: e?.message || 'Failed to load summary' });
  }
});

const port = Number(process.env.PORT || 4000);
app.use(errorHandler);
app.listen(port, () => console.log(`API running at http://localhost:${port}`));
