/** Typed access to dynamic Prisma model delegates (avoids `any`). */
import { prisma } from '@/lib/prisma';

export type PrismaModelDelegate = {
  findMany: (args?: unknown) => Promise<unknown[]>;
  findFirst: (args?: unknown) => Promise<unknown | null>;
  findUnique: (args?: unknown) => Promise<unknown | null>;
  create: (args?: unknown) => Promise<unknown>;
  createMany: (args?: unknown) => Promise<{ count: number }>;
  update: (args?: unknown) => Promise<unknown>;
  updateMany: (args?: unknown) => Promise<{ count: number }>;
  upsert: (args?: unknown) => Promise<unknown>;
  delete: (args?: unknown) => Promise<unknown>;
  deleteMany: (args?: unknown) => Promise<{ count: number }>;
  count: (args?: unknown) => Promise<number>;
  aggregate: (args?: unknown) => Promise<Record<string, unknown>>;
};

export function prismaDelegate(modelName: string): PrismaModelDelegate {
  const delegate = (prisma as unknown as Record<string, PrismaModelDelegate | undefined>)[modelName];
  if (!delegate) {
    throw new Error(`Unknown Prisma model: ${modelName}`);
  }
  return delegate;
}
