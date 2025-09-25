// server/src/index.ts
import * as dotenv from 'dotenv';
dotenv.config();

try {
  const u = new URL(process.env.DATABASE_URL || '');
  console.log('[DB]', {
    host: u.hostname,
    port: u.port,
    pgbouncer: u.searchParams.get('pgbouncer'),
    connection_limit: u.searchParams.get('connection_limit')
  });
} catch (e) {
  console.log('[DB] could not parse DATABASE_URL');
}

import { z } from 'zod';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { withRequestId, log } from './middleware/logger';
import { errorHandler } from './middleware/errors';
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
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

// month key
// --- helper: month key (UTC) ---
function monthKeyUTC(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Return a Map<YYYY-MM, cents> with planned bills for each month in [first..endIncl]. */
async function buildBillsPlanByMonth(userId: string, first: Date, endIncl: Date) {
  // 1) Fetch all user bills; do overlap checks in JS so NULLs are easy
  const bills = await prisma.bills.findMany({
    where: { user_id: userId },
    select: {
      id: true,
      name: true,
      cadence: true,
      amount_cents: true,
      start_date: true,
      end_date: true,
    },
  });

  const plan = new Map<string, number>();

  // cadence → monthly factor (approx for weekly/biweekly/annual/quarterly)
  const factor: Record<string, number> = {
    weekly: 52 / 12,
    biweekly: 26 / 12,
    monthly: 1,
    quarterly: 1 / 3,
    annual: 1 / 12,
    once: 0, // handled specially
  };

  // 2) Iterate each month in the window, inclusive
  let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  while (cursor <= endIncl) {
    const key = monthKeyUTC(cursor);
    const monthStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const monthEnd   = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59)); // inclusive EOM

    let cents = 0;

    for (const b of bills) {
      const amt = Number(b.amount_cents) || 0;

      // Is bill active this month? (null start = always active from beginning; null end = open-ended)
      const startsBy = b.start_date ?? monthEnd;   // if null, treat as already started
      const endsOn   = b.end_date   ?? monthEnd;   // if null, treat as still active

      const overlaps =
        (b.start_date == null || startsBy <= monthEnd) &&
        (b.end_date   == null || endsOn   >= monthStart);

      if (!overlaps) continue;

      switch (b.cadence) {
        case 'monthly':
        case 'weekly':
        case 'biweekly':
        case 'quarterly':
        case 'annual':
          cents += Math.round(amt * (factor[b.cadence] ?? 1));
          break;

        case 'once': {
          // For a one-off, count only in its start_date month
          if (b.start_date &&
              b.start_date.getUTCFullYear() === monthStart.getUTCFullYear() &&
              b.start_date.getUTCMonth()    === monthStart.getUTCMonth()) {
            cents += amt;
          }
          break;
        }

        default:
          // Fallback: treat as monthly
          cents += amt;
      }
    }

    plan.set(key, cents);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return plan;
}


// strict month range from "YYYY-MM"
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

// validator for bills creation
const billCreateSchema = z.object({
  name: z.string().min(1),
  amount_cents: z.number().int().nonnegative().optional(),
  amount: z.number().nonnegative().optional(),
  cadence: z.enum(['weekly','biweekly','monthly','quarterly','annual','once']),
  type: z.enum(['bill','subscription']).default('bill'),
  due_day: z.number().int().min(1).max(31).optional().nullable(),
  start_date: z.coerce.date().optional().nullable(),
  end_date: z.coerce.date().optional().nullable(),
  payment_method: z.enum(['credit','debit','cash','ach']).optional().nullable(),
  notes: z.string().max(10_000).optional().nullable(),
})
.refine(d => d.amount_cents !== undefined || d.amount !== undefined, {
  message: 'Provide amount_cents or amount',
  path: ['amount'],
})
.transform(d => ({
  ...d,
  amount_cents: d.amount_cents ?? Math.round((d.amount ?? 0) * 100),
}));

/* ------------------------------------------------------------------ */
/* Auth                                                               */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

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

app.get('/api/settings/assumptions', requireAuth, async (req: any, res) => {
  const a = await prisma.assumptions.findUnique({ where: { user_id: req.userId } });
  res.json(a || null);
});

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

/* ------------------------------------------------------------------ */
/* Health                                                             */
/* ------------------------------------------------------------------ */

// app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, build: 'summary-with-bills+debug' })
);


/* ------------------------------------------------------------------ */
/* Categories & Merchants                                             */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Income                                                             */
/* ------------------------------------------------------------------ */

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

// HARD DELETE income row
app.delete('/api/income/:id', requireAuth, async (req: any, res) => {
  const del = await prisma.income.deleteMany({
    where: { id: String(req.params.id), user_id: req.userId },
  });
  if (del.count === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/* Transactions (spending)                                            */
/* ------------------------------------------------------------------ */

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
      method: parsed.data.method,
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

// HARD DELETE transaction row
app.delete('/api/transactions/:id', requireAuth, async (req: any, res) => {
  const del = await prisma.transactions.deleteMany({
    where: { id: String(req.params.id), user_id: req.userId },
  });
  if (del.count === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/* Monthly overview (DB view)                                         */
/* ------------------------------------------------------------------ */

app.get('/api/overview', requireAuth, async (_req, res) => {
  const month = String((_req as any).query?.month || '');
  const rows = await prisma.$queryRaw<
    { month_key: string; income: number; fixed_expenses: number; flexible_expenses: number }[]
  >`SELECT * FROM app.monthly_overview WHERE month_key = ${month}`;
  res.json(rows);
});

/* ------------------------------------------------------------------ */
/* Forecast to Dec 2027 (includes planned bills)                      */
/* ------------------------------------------------------------------ */

app.get('/api/forecast', requireAuth, async (req: any, res) => {
  try {
    const debug = String(req.query.debug || '') === '1'; // DEBUG
    const startKey = String(req.query.start || new Date().toISOString().slice(0,7)); // "YYYY-MM"
    if (!/^\d{4}-\d{2}$/.test(startKey)) {
      return res.status(400).json({ error: 'start must be YYYY-MM' });
    }

    const a = await prisma.assumptions.findUnique({ where: { user_id: req.userId } });
    if (!a) return res.status(400).json({ error: 'Set assumptions first (current savings & as_of_date).' });

    const toKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;

    const asOf = new Date(Date.UTC(a.as_of_date.getUTCFullYear(), a.as_of_date.getUTCMonth(), 1));
    const startParts = startKey.split('-').map(Number);
    const requested = new Date(Date.UTC(startParts[0], startParts[1]-1, 1));
    const first = requested < asOf ? asOf : requested;
    const end = new Date(Date.UTC(2027, 11, 1)); // Dec 2027

    const incRows: { month_key: string; cents: bigint }[] = await prisma.$queryRaw`
      SELECT to_char(date, 'YYYY-MM') AS month_key, SUM(amount_cents)::bigint AS cents
      FROM "app"."income"
      WHERE user_id = ${req.userId}::uuid
      GROUP BY 1
    `;

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

    // 👇 include planned bills for forecast horizon
    const billsPlanByMonth = await buildBillsPlanByMonth(req.userId, first, end);

    const out: { month_key: string; net_change_cents: number; savings_cents: number }[] = [];
    let running = a.current_savings_cents;

    let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    const debugRows: any[] = []; // DEBUG

    while (cursor <= end) {
      const key = toKey(cursor);
      const inc = incomeByMonth.get(key) ?? 0;

      const actualSpend  = spendByMonth.get(key) ?? 0;
      const plannedBills = billsPlanByMonth.get(key) ?? 0;

      const now = new Date();
      const isPastMonth =
        cursor.getUTCFullYear() <  now.getUTCFullYear() ||
        (cursor.getUTCFullYear() === now.getUTCFullYear() &&
         cursor.getUTCMonth()    <  now.getUTCMonth());

      // Past = actuals; Current/Future = ensure bills at minimum (no double count)
      const spend = isPastMonth ? actualSpend : Math.max(actualSpend, plannedBills);

      const net  = inc - spend;
      running   += net;
      out.push({ month_key: key, net_change_cents: net, savings_cents: running });

      // DEBUG
      if (debug) {
        debugRows.push({
          key, isPastMonth, inc, actualSpend, plannedBills, chosenSpend: spend, net
        });
      }

      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth()+1, 1));
    }

    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to build forecast' });
  }
});

/* ------------------------------------------------------------------ */
/* Bills (recurring)                                                  */
/* ------------------------------------------------------------------ */

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

app.get('/api/subscriptions', requireAuth, async (req: any, res) => {
  const rows = await prisma.bills.findMany({
    where: { user_id: req.userId, type: 'subscription' },
    orderBy: { name: 'asc' },
  });
  res.json(rows);
});

app.post('/api/bills', requireAuth, async (req: any, res) => {
  const parsed = billCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;

  try {
    const row = await prisma.bills.create({
      data: {
        user_id: req.userId,
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

/* ------------------------------------------------------------------ */
/* Monthly totals for dashboard tiles (includes planned bills)        */
/* ------------------------------------------------------------------ */

app.get('/api/summary', requireAuth, async (req: any, res) => {
  try {
    const debug = String(req.query.debug || '') === '1';
    const month = String(req.query.month || '');
    const { start, end } = monthRange(month); // end = first of next month

    // Build an explicit end-of-month timestamp for the bills helper (inclusive)
    const endOfMonth = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59)
    );

    // Core aggregates (actuals)
    const [incAgg, spendAgg] = await Promise.all([
      prisma.income.aggregate({
        _sum: { amount_cents: true },
        where: { user_id: req.userId, date: { gte: start, lt: end } },
      }),
      prisma.transactions.aggregate({
        _sum: { amount_cents: true },
        where: { user_id: req.userId, date: { gte: start, lt: end } },
      }),
    ]);

    // Planned bills for this month
    const billsPlanByMonth = await buildBillsPlanByMonth(req.userId, start, endOfMonth);

    const incomeCents       = Number(incAgg._sum.amount_cents ?? 0);
    const actualSpendCents  = Number(spendAgg._sum.amount_cents ?? 0);
    const key               = `${start.getUTCFullYear()}-${String(start.getUTCMonth()+1).padStart(2,'0')}`;
    const plannedBillsCents = billsPlanByMonth.get(key) ?? 0;

    // Past months use actuals; current/future use max(actual, planned)
    const now = new Date();
    const isPastMonth =
      start.getUTCFullYear() <  now.getUTCFullYear() ||
      (start.getUTCFullYear() === now.getUTCFullYear() &&
       start.getUTCMonth()    <  now.getUTCMonth());

    const spendingCents = isPastMonth
      ? actualSpendCents
      : Math.max(actualSpendCents, plannedBillsCents);

    const payload: any = {
      month,
      income:   incomeCents   / 100,
      spending: spendingCents / 100,
      net:      (incomeCents - spendingCents) / 100,
    };

    if (debug) {
      // Extra introspection to figure out why planned bills == 0
      const billsForUser = await prisma.bills.findMany({
        where: { user_id: req.userId },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          cadence: true,
          amount_cents: true,
          start_date: true,
          end_date: true,
          type: true,
        },
      });

      payload._debug = {
        window: {
          startUTC: start.toISOString(),
          endExclusiveUTC: end.toISOString(),
          endOfMonthInclusiveUTC: endOfMonth.toISOString(),
        },
        actualSpendCents,
        plannedBillsCents,
        picked: isPastMonth ? 'actual' : 'max(actual, planned)',
        billsCount: billsForUser.length,
        // First few bills so we can eyeball the dates/cadence
        billsSample: billsForUser.slice(0, 5).map(b => ({
          id: b.id, name: b.name, cadence: b.cadence, type: b.type,
          amount_cents: b.amount_cents,
          start_date: b.start_date ? b.start_date.toISOString().slice(0,10) : null,
          end_date:   b.end_date   ? b.end_date.toISOString().slice(0,10)   : null,
        })),
        // What keys exist in the plan map?
        planKeys: Array.from(billsPlanByMonth.keys()).slice(0, 24),
        planThisKey: { key, cents: plannedBillsCents },
      };
    }

    res.json(payload);
  } catch (e: any) {
    const status = e?.status ?? 500;
    res.status(status).json({ error: e?.message || 'Failed to load summary' });
  }
});



const port = Number(process.env.PORT || 4000);
app.use(errorHandler);
app.listen(port, () => console.log(`API running at http://localhost:${port}`));
