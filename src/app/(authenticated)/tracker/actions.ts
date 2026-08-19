'use server';

import { prismaDelegate } from '@/lib/prisma-delegate';
import { getSession } from '@/lib/auth';
import { getTrackerTable } from '@/lib/tracker-tables';
import {
  hasBlockingIssues,
  rowHasBlockingIssue,
  validateTrackerRows,
  type TrackerInputRow,
} from '@/lib/tracker-bulk-upload';
import { revalidatePath } from 'next/cache';

async function requireAdmin() {
  const session = await getSession();
  if (session?.user?.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }
}

export async function getTrackerRows(slug: string) {
  await requireAdmin();
  const config = getTrackerTable(slug);
  if (!config) return null;

  const delegate = prismaDelegate(config.prismaModel);
  const rows = await delegate.findMany({ orderBy: { id: 'asc' } });
  return rows.map((row: any) => ({
    id: row.id as number,
    name: String(row[config.nameField] ?? ''),
  }));
}

export async function upsertTrackerRow(slug: string, id: number, name: string) {
  await requireAdmin();
  const config = getTrackerTable(slug);
  if (!config || !id || !name.trim()) {
    return { error: 'Invalid data' };
  }

  const delegate = prismaDelegate(config.prismaModel);
  try {
    await delegate.upsert({
      where: { id },
      update: { [config.nameField]: name.trim() },
      create: { id, [config.nameField]: name.trim() },
    });
    revalidatePath(`/tracker/${slug}`);
    return { success: true };
  } catch (e: unknown) {
    return { error: (e instanceof Error ? e.message : String(e)) || 'Failed to save' };
  }
}

export async function deleteTrackerRow(slug: string, id: number) {
  await requireAdmin();
  const config = getTrackerTable(slug);
  if (!config) return { error: 'Unknown table' };

  const delegate = prismaDelegate(config.prismaModel);
  try {
    await delegate.delete({ where: { id } });
    revalidatePath(`/tracker/${slug}`);
    return { success: true };
  } catch {
    return { error: 'Cannot delete — row may be linked to admission forms.' };
  }
}

export async function validateTrackerBulkUpload(
  slug: string,
  rows: { line: number; id: number | null; name: string; prefix?: string }[]
) {
  await requireAdmin();
  const config = getTrackerTable(slug);
  if (!config) return { error: 'Unknown table' as const };

  const existing = (await getTrackerRows(slug)) ?? [];
  const issues = validateTrackerRows(rows as TrackerInputRow[], existing);

  const result = rows.map(row => ({
    line: row.line,
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    issues: issues.get(row.line) ?? [],
  }));

  return {
    rows: result,
    hasBlocking: hasBlockingIssues(issues),
    validCount: result.filter(r => !rowHasBlockingIssue(r.issues)).length,
  };
}

export async function bulkUpsertTrackerRows(
  slug: string,
  rows: { id: number; name: string; prefix?: string }[]
) {
  await requireAdmin();
  const config = getTrackerTable(slug);
  if (!config) return { error: 'Unknown table' };

  const existing = (await getTrackerRows(slug)) ?? [];
  const inputs: TrackerInputRow[] = rows.map((row, index) => ({
    line: index,
    id: row.id,
    name: row.name,
    prefix: row.prefix,
  }));
  const issues = validateTrackerRows(inputs, existing);

  const delegate = prismaDelegate(config.prismaModel);
  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIssues = issues.get(i) ?? [];
    if (rowHasBlockingIssue(rowIssues)) {
      skipped++;
      continue;
    }

    const data: Record<string, string> = { [config.nameField]: row.name.trim() };
    if (config.slug === 'enrollment' && row.prefix !== undefined) {
      data.prefix = row.prefix.trim();
    }

    try {
      await delegate.upsert({
        where: { id: row.id },
        update: data,
        create: { id: row.id, ...data },
      });
      saved++;
    } catch (e: unknown) {
      skipped++;
      errors.push(`id ${row.id}: ${(e instanceof Error ? e.message : String(e)) || 'Failed to save'}`);
    }
  }

  revalidatePath(`/tracker/${slug}`);
  return { success: true, saved, skipped, errors };
}
