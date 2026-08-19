import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { parseDateInput } from '@/lib/dates';
import {
  resolveAdmissionFormLookups,
  resolveBatchFk,
  resolvePaymentOptionFk,
  resolveProgramFk,
} from '@/lib/lookups';
import {
  processPaymentUpload,
} from '@/lib/payment-upload';
import { getPaymentSource, type PaymentUploadSlug } from '@/lib/payment-sources';
import { saveLegacyAdmissionForm } from '@/lib/legacy-admission-form';
import { processConsolidatedPayoutUpload } from '@/lib/consolidated-payout-upload';

export async function POST(req: NextRequest, context: { params: Promise<{ type: string }> }) {
  try {
    const session = await getSession();
    if (session?.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type } = await context.params;
    const body = await req.json();
    const { data, category } = body;

    if (!data || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
    }

    const processInChunks = async <T,>(items: T[], fn: (item: T) => Promise<unknown>, chunkSize = 5) => {
      let count = 0;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const results = [];
        for (const item of chunk) {
          try {
            results.push(await fn(item));
          } catch (err) {
            console.error('Error processing item:', err);
            throw err;
          }
        }
        count += results.filter(r => r !== null && r !== undefined).length;
      }
      return count;
    };

    if (type === 'fee') {
      const count = await processInChunks(data, async (row: any) => {
        if (!row.batch || !row.payment_option || !row.program) return null;

        const [batchId, paymentOptionId, programId] = await Promise.all([
          resolveBatchFk(row.batch),
          resolvePaymentOptionFk(row.payment_option),
          resolveProgramFk(row.program),
        ]);
        if (!batchId || !paymentOptionId || !programId) return null;

        await prisma.feeStructure.upsert({
          where: {
            batchId_paymentOptionId_programId: {
              batchId,
              paymentOptionId,
              programId,
            },
          },
          update: {
            semFee: parseFloat(row.sem_fee) || 0,
          },
          create: {
            batchId,
            paymentOptionId,
            programId,
            semFee: parseFloat(row.sem_fee) || 0,
          },
        });
        return true;
      });
      return NextResponse.json({ success: true, count });
    }

    if (getPaymentSource(type)) {
      const count = await processPaymentUpload(type as PaymentUploadSlug, data);
      return NextResponse.json({ success: true, count });
    }

    if (type === 'consolidated-payout') {
      const count = await processConsolidatedPayoutUpload(data, category);
      return NextResponse.json({ success: true, count });
    }

    if (type === 'form') {
      const count = await processInChunks(data, async (row: any) => {
        const enrollmentRef =
          row.Enrollment_No ??
          row['Enrollment No'] ??
          row.enrollment_id ??
          row.enrollmentId ??
          row.enrollmentNo ??
          row.EnrollmentNo ??
          row.enrollment_no;
        if (enrollmentRef === undefined || enrollmentRef === null || enrollmentRef === '') return null;

        const doa = parseDateInput(
          row.Date_of_Admission ||
            row.doa ||
            row.DOA ||
            row.DateOfAdmission ||
            row['Date of Admission'] ||
            row['Date Of Admission']
        );

        const lookups = await resolveAdmissionFormLookups({
          enrollmentNo: enrollmentRef,
          program: row.Program ?? row.program ?? null,
          paymentOption:
            row.Payment_option ??
            row.PaymentOption ??
            row['Payment Option'] ??
            row.paymentOption ??
            row.payment_option ??
            null,
          batch: row.Batch ?? row.batch ?? null,
          type: row.Type ?? row.type ?? null,
          status: row.Status ?? row.status ?? null,
          team: row.Team ?? row.team ?? null,
          bifurcation: row.Bifurcation ?? row.bifurcation ?? null,
          nationality: row.nationality ?? row.Nationality ?? null,
          location: row.Location ?? row.location ?? null,
          placedStatus: row['Placed Status'] ?? row.PlacedStatus ?? row.placed_status ?? null,
          leadSource: row.Lead_source ?? row['Lead Source'] ?? row.leadSource ?? null,
          ugcStatus: row.UGC_Status ?? row['UGC Status'] ?? row.ugcStatus ?? null,
          counselor: row.Councellor ?? row.Counselor ?? row.counselor ?? null,
        });

        if (!lookups.enrollmentId) return null;

        const enrollmentText =
          typeof enrollmentRef === 'string' && !/^\d+$/.test(enrollmentRef.trim())
            ? enrollmentRef.trim()
            : undefined;

        await saveLegacyAdmissionForm(null, {
          enrollmentNo: enrollmentText ?? enrollmentRef,
          program: row.Program ?? row.program ?? null,
          paymentOption:
            row.Payment_option ??
            row.PaymentOption ??
            row['Payment Option'] ??
            row.paymentOption ??
            row.payment_option ??
            null,
          batch: row.Batch ?? row.batch ?? null,
          type: row.Type ?? row.type ?? null,
          status: row.Status ?? row.status ?? null,
          team: row.Team ?? row.team ?? null,
          bifurcation: row.Bifurcation ?? row.bifurcation ?? null,
          nationality: row.nationality ?? row.Nationality ?? null,
          location: row.Location ?? row.location ?? null,
          placedStatus: row['Placed Status'] ?? row.PlacedStatus ?? row.placed_status ?? null,
          leadSource: row.Lead_source ?? row['Lead Source'] ?? row.leadSource ?? null,
          ugcStatus: row.UGC_Status ?? row['UGC Status'] ?? row.ugcStatus ?? null,
          counselor: row.Councellor ?? row.Counselor ?? row.counselor ?? null,
          sno: parseInt(row.Sno || row.sno, 10) || null,
          doa,
          name: row.Name || row.name || null,
          aadhaar: row.Adhar || row.Aadhaar || row.aadhaar || null,
        });
        return true;
      });
      return NextResponse.json({ success: true, count });
    }

    return NextResponse.json({ error: 'Invalid upload type' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
