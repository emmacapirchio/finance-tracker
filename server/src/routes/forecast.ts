// server/src/routes/forecast.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { log } from '../middleware/logger';
import { requireAuth } from '../auth';

const qSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}$/, 'start must be YYYY-MM'),
  months: z.coerce.number().int().min(1).max(36).default(12),
});

const router = Router();

/**
 * GET /forecast?start=YYYY-MM&months=12
 * Returns summed income/expense cents over the given period.
 */
router.get(
  '/',
  requireAuth,
  async (req: Request & { userId: string }, res: Response) => {
    const { start, months } = qSchema.parse(req.query);
    const traceId = (req as any).traceId;

    const [y, m] = start.split('-').map(Number);
    const startDate = new Date(Date.UTC(y, m - 1, 1));
    const endDate = new Date(Date.UTC(y, m - 1 + months, 1));

    log.info({ traceId, route: 'GET /forecast', userId: req.userId, start, months }, 'Forecast request');

    // Pull transactions and join categories to infer income vs expense
    const txns = await prisma.transactions.findMany({
      where: {
        user_id: req.userId,
        date: { gte: startDate, lt: endDate },
      },
      select: {
        amount_cents: true,
        categories: { select: { kind: true } },
      },
    });

    // Sum based on category.kind
    let income_cents = 0;
    let expense_cents = 0;
    for (const t of txns) {
      if (t.categories?.kind === 'income') income_cents += t.amount_cents;
      else expense_cents += t.amount_cents;
    }

    res.json({
      traceId,
      start,
      months,
      totals: { income_cents, expense_cents },
    });
  }
);

export default router;
