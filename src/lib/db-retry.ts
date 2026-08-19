import { PrismaClient } from '@/generated/prisma';
import { getPrisma } from '@/lib/prisma';

const RETRYABLE_CODES = new Set(['P1001', 'P1002', 'P1017']);

function isRetryableDbError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    RETRYABLE_CODES.has(String((error as { code?: string }).code))
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resetPrismaConnection() {
  const globalForPrisma = globalThis as { prisma?: PrismaClient };
  if (globalForPrisma.prisma) {
    try {
      await globalForPrisma.prisma.$disconnect();
    } catch {
      // ignore disconnect errors while resetting pool
    }
    globalForPrisma.prisma = undefined;
  }
}

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options: { retries?: number; delayMs?: number; resetOnRetry?: boolean } = {}
): Promise<T> {
  const { retries = 3, delayMs = 1500, resetOnRetry = true } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const canRetry = isRetryableDbError(error) && attempt < retries - 1;
      if (!canRetry) break;

      if (resetOnRetry) {
        await resetPrismaConnection();
      }
      await sleep(delayMs * (attempt + 1));
    }
  }

  throw lastError;
}

export async function isDatabaseReachable(retries = 3): Promise<boolean> {
  try {
    await withDbRetry(() => getPrisma().$queryRaw`SELECT 1`, { retries });
    return true;
  } catch {
    return false;
  }
}
