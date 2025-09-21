// src/middleware/logger.ts
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import pino from 'pino';

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
});

export function withRequestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id'); // case-insensitive
  const traceId = incoming || randomUUID();
  (req as any).traceId = traceId;
  res.setHeader('x-request-id', traceId);
  next();
}
