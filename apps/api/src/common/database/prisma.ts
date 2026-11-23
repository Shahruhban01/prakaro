import { PrismaClient } from '@prisma/client';
import { env } from '../../config/env';

declare global {
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
    log: env.NODE_ENV === 'production' ? [] : ['warn', 'error'],
  });

if (env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
  } catch (error) {
    console.error('Failed to connect to MySQL database', error instanceof Error ? error.name : 'Unknown');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error('Failed to disconnect from MySQL database', error instanceof Error ? error.name : 'Unknown');
  }
}
