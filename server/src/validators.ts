import { z } from 'zod';

/* -----------------------------
   Helpers
------------------------------*/

// Accept "YYYY-MM-DD" only (you already store Date in DB later)
const yyyyMmDd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// Accept numbers OR numeric strings; ensure finite, nonnegative, <= 2 decimals
const moneyAmount = z
  .coerce.number()
  .finite()
  .nonnegative()
  .refine(v => Math.round(v * 100) === v * 100, 'Max 2 decimal places');

// Handle optional/nullable UUID coming from forms that send "" for empty
const uuidOrNull = z
  .union([z.string().uuid(), z.literal('')])
  .optional()
  .transform(v => (v === '' || v === undefined ? null : v));

// Optional text: trim; convert "" to undefined; cap length to keep DB happy
const optionalText = z
  .string()
  .trim()
  .max(1000, 'Too long')
  .optional()
  .transform(v => (v === '' ? undefined : v));

/* -----------------------------
   Schemas
------------------------------*/

export const incomeSchema = z.object({
  date: yyyyMmDd,
  amount: moneyAmount.positive('Amount must be > 0'),
  source: z.string().trim().min(1, 'Source required').max(120, 'Too long'),
  categoryId: uuidOrNull, // -> string | null
  notes: optionalText,    // -> string | undefined
});

export const txnSchema = z.object({
  date: yyyyMmDd,
  amount: moneyAmount.positive('Amount must be > 0'),
  merchantId: uuidOrNull,          // -> string | null
  merchantName: optionalText,      // -> string | undefined
  categoryId: uuidOrNull,          // -> string | null
  method: z.enum(['credit', 'debit', 'cash', 'ach']),
  notes: optionalText,
});

/* -----------------------------
   Types (handy for controllers)
------------------------------*/
export type IncomeInput = z.infer<typeof incomeSchema>;
export type TxnInput    = z.infer<typeof txnSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),  // allow setting a first password
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export const assumptionsSchema = z.object({
  currentSavings: z.coerce.number().nonnegative(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  apr: z.coerce.number().min(0).max(100).optional(),     // optional %
  inflation: z.coerce.number().min(0).max(100).optional()
});