// server/src/prisma.ts
import { PrismaClient } from '@prisma/client';

// Belt & suspenders: guarantee the runtime client uses the pooled DATABASE_URL
// (the one with ?pgbouncer=true&connection_limit=1 on port 6543).
const url = process.env.DATABASE_URL;
if (!url) {
  // Fail fast with a clear error instead of falling back silently.
  throw new Error('DATABASE_URL is not set');
}

export const prisma = new PrismaClient({
  datasources: { db: { url } },
  log:
    process.env.NODE_ENV === 'production'
      ? ['error', 'warn']
      : ['query', 'error', 'warn', 'info'],
  errorFormat: 'pretty',
});

// Optional: be a good citizen on shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
