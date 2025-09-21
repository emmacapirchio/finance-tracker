// src/middleware/errors.ts
import type { Request, Response, NextFunction } from 'express';
import { log } from './logger';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const traceId = (req as any).traceId as string | undefined;
  const base = { traceId };

  // JSON parse errors (from express.json())
  if (err instanceof SyntaxError && 'status' in (err as any) && (err as any).status === 400) {
    log.warn({ err, traceId }, 'Malformed JSON body');
    return res.status(400).json({ ...base, error: 'BadJson', message: 'Malformed JSON body' });
  }

  // Zod (400)
  if (err instanceof ZodError) {
    log.warn({ err, traceId }, 'Validation failed');
    return res.status(400).json({ ...base, error: 'ValidationError', issues: err.issues });
  }

  // Prisma known errors (409/404/etc.)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const map: Record<string, number> = {
      P2002: 409, // unique constraint
      P2025: 404, // record not found
    };
    const status = map[err.code] ?? 409; // default to conflict for "known" unless mapped
    log.error({ err: { code: err.code, meta: err.meta }, traceId }, 'Prisma known error');
    return res.status(status).json({
      ...base,
      error: 'PrismaError',
      code: err.code,
      meta: err.meta,
    });
  }

  // Prisma validation/runtime
  if (err instanceof Prisma.PrismaClientValidationError) {
    log.error({ message: err.message, traceId }, 'Prisma validation');
    return res.status(400).json({ ...base, error: 'PrismaValidation', message: err.message });
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    log.error({ message: (err as Error).message, traceId }, 'Prisma unknown');
    return res.status(500).json({ ...base, error: 'PrismaUnknown', message: (err as Error).message });
  }

  // Fallback
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  log.error({ message: msg, stack, traceId }, 'Unhandled error');
  return res.status(500).json({
    ...base,
    error: 'InternalServerError',
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : msg,
    stack: process.env.NODE_ENV === 'production' ? undefined : stack,
  });
}