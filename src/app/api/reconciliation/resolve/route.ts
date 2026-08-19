import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { prismaDelegate } from '@/lib/prisma-delegate';
import { getSession } from '@/lib/auth';
import {
  getEnrollmentTextById,
  getLegacyBatchByEnrollmentId,
} from '@/lib/legacy-admission-form';
import { ensureEnrollmentId } from '@/lib/lookups';
import { legacyPaymentTableName, usesLegacyPaymentSchema, usesNormalizedRawPaymentSchema } from '@/lib/legacy-payment-tables';

async function getTableColumnSet(table: string): Promise<Set<string>> {
  const cols = await prisma.$queryRawUnsafe<Array<{ Field: string }>>(
    `SHOW COLUMNS FROM \`${table}\``
  );
  return new Set(cols.map((c) => c.Field));
}

const SOURCE_DELEGATES: Record<string, string> = {
  Razorpay: 'razorpayPayment',
  Jodo: 'jodoPayment',
  Early: 'earlyPayment',
  Offline: 'offlinePayment',
  Bank: 'bankPayment',
  Propelld: 'propelldPayment',
  Others: 'othersPayment',
};

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (session?.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { transactionId, sourceName, newEnrollmentNo } = await req.json();

    if (!transactionId || !sourceName || !newEnrollmentNo) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const delegateName = SOURCE_DELEGATES[sourceName];
    if (!delegateName) {
      return NextResponse.json({ error: 'Invalid source name' }, { status: 400 });
    }

    const enrollmentId = await ensureEnrollmentId(newEnrollmentNo);
    if (!enrollmentId) {
      return NextResponse.json({ error: 'Invalid enrollment number' }, { status: 400 });
    }
    const enrollment = { id: enrollmentId };

    const batchId = await getLegacyBatchByEnrollmentId(enrollment.id);
    const enrollmentText = await getEnrollmentTextById(enrollment.id);

    if (await usesLegacyPaymentSchema(delegateName)) {
      const table = legacyPaymentTableName(delegateName);
      const tableCols = await getTableColumnSet(table);
      const setParts = ['enrollment_id = ?'];
      const values: unknown[] = [enrollmentText];
      if (tableCols.has('enrollmentId')) {
        setParts.push('enrollmentId = ?');
        values.push(enrollment.id);
      }
      if (tableCols.has('batchId')) {
        setParts.push('batchId = ?');
        values.push(batchId);
      }
      values.push(transactionId);
      await prisma.$executeRawUnsafe(
        `UPDATE \`${table}\` SET ${setParts.join(', ')} WHERE \`settlement_utr_/_transaction_id\` = ?`,
        ...values
      );
    } else if (await usesNormalizedRawPaymentSchema(delegateName)) {
      const table = legacyPaymentTableName(delegateName);
      await prisma.$executeRawUnsafe(
        `UPDATE \`${table}\` SET enrollmentid = ?, batchid = ? WHERE transactionid = ?`,
        enrollment.id,
        batchId,
        transactionId
      );
    } else {
      const specificTableDelegate = prismaDelegate(delegateName);
      await specificTableDelegate.update({
        where: { transactionId },
        data: { enrollmentId: enrollment.id, batchId },
      });
    }

    await prisma.consolidatedPayment.update({
      where: { transactionId },
      data: { enrollmentId: enrollment.id, batchId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Resolve Error:', error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
