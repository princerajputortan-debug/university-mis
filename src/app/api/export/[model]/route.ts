import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import * as XLSX from 'xlsx';
import { Prisma } from '@/generated/prisma';
import { buildModelSearchWhere } from '@/lib/prisma-search';
import { formatModelRows, getModelDisplayConfig } from '@/lib/database-display';
import {
  fetchAllPaymentTableRowsForExport,
  isLegacyPaymentModel,
  usesPaymentRawQueries,
} from '@/lib/legacy-payment-tables';
import { fetchConsolidatedPaymentsForExport } from '@/lib/consolidated-payment-export';

export const maxDuration = 300;

export async function GET(request: Request, { params }: { params: Promise<{ model: string }> }) {
  const session = await getSession();
  
  if (session?.user?.role !== 'ADMIN') {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const resolvedParams = await params;
  const modelName = resolvedParams.model;

  // Validate that the model exists in Prisma
  if (!(modelName in prisma)) {
    return new NextResponse('Model not found', { status: 404 });
  }

  const modelDmmf = Prisma.dmmf.datamodel.models.find(m => m.name.toLowerCase() === modelName.toLowerCase());
  const hasField = (fieldName: string): boolean =>
    !!modelDmmf?.fields.some(f => f.name === fieldName);

  const url = new URL(request.url);
  const q = url.searchParams.get('q');
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  try {
    const whereClause: Record<string, unknown> = {};
    const AND: Record<string, unknown>[] = [];

    if (q) {
      const searchConditions = buildModelSearchWhere(modelName, q, hasField);
      if (searchConditions.length > 0) {
        AND.push({ OR: searchConditions });
      }
    }

    if (start || end) {
      const dateFilter: Record<string, Date> = {};
      if (start) dateFilter.gte = new Date(start);
      if (end) {
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999);
        dateFilter.lte = endDate;
      }

      if (hasField('date')) {
        AND.push({ date: dateFilter });
      } else if (hasField('createdAt')) {
        AND.push({ createdAt: dateFilter });
      }
    }

    if (AND.length > 0) {
      whereClause.AND = AND;
    }

    const displayConfig = getModelDisplayConfig(modelName);
    const paymentRaw = isLegacyPaymentModel(modelName) && (await usesPaymentRawQueries(modelName));
    const isConsolidatedPayment =
      modelName === 'consolidatedPayment' || modelName === 'ConsolidatedPayment';

    let data: Record<string, unknown>[];

    if (isConsolidatedPayment) {
      // Raw SQL avoids Prisma P2020 on invalid MySQL zero-dates in `date`
      data = await fetchConsolidatedPaymentsForExport({
        q: q || undefined,
        start: start || undefined,
        end: end || undefined,
      });
    } else if (paymentRaw) {
      data = await fetchAllPaymentTableRowsForExport(modelName, {
        q: q || undefined,
        start: start || undefined,
        end: end || undefined,
      });
    } else {
      const findManyArgs: Record<string, unknown> = {
        where: whereClause,
        orderBy: { id: 'desc' },
      };
      if (displayConfig?.include) {
        findManyArgs.include = displayConfig.include;
      }

            const rawData = await (prisma as any)[modelName].findMany(findManyArgs);
      data = formatModelRows(modelName, rawData);
    }

    if (data.length === 0) {
      return new NextResponse('No data found to export', { status: 404 });
    }

    // Format data for Excel
    const formattedData = data.map((row: Record<string, unknown>) => {
      const formatted: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        if (val instanceof Date) {
          formatted[key] = val.toISOString().replace('T', ' ').slice(0, 19);
        } else if (typeof val === 'object' && val !== null) {
          formatted[key] = JSON.stringify(val);
        } else {
          formatted[key] = val;
        }
      }
      return formatted;
    });

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(formattedData);

    // Auto-size columns
    const headers = Object.keys(formattedData[0]);
    ws['!cols'] = headers.map(h => ({
      wch: Math.max(h.length, 15)
    }));

    XLSX.utils.book_append_sheet(wb, ws, modelName);

    // Generate buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `${modelName}_export_${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('Export error:', error);
    return new NextResponse('Failed to export data', { status: 500 });
  }
}
