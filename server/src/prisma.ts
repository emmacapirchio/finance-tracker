// server/src/prisma.ts
import { PrismaClient } from '@prisma/client';

// Fail fast if the pooled URL is missing (prevents silent fallback)
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  // If this throws on Render, it means the service env is missing DATABASE_URL.
  // Set it on the service (not only in an env group), then redeploy.
  throw new Error('DATABASE_URL is not set');
}

// Force Prisma to use the pooled URL (host ...pooler..., port 6543, pgbouncer=true)
export const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
  log: process.env.NODE_ENV === 'production'
    ? ['error', 'warn']
    : ['query', 'error', 'warn', 'info'],
  errorFormat: 'pretty',
});

// Be polite on shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
