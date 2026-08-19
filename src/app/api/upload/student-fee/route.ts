import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveStudentFeeLookups } from '@/lib/lookups';

export async function POST(req: Request) {
  try {
    const { data } = await req.json();

    if (!Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
    }

    let count = 0;
    for (const row of data) {
      if (!row['Enrollment No']) continue;

      const sem1Fee = parseFloat(row['Sem 1 Fee']) || null;
      const sem1Schol = parseFloat(row['Sem 1 Scholarship']) || null;
      const sem1After = sem1Fee !== null ? Math.max(0, sem1Fee - (sem1Schol || 0)) : null;

      const sem2Fee = parseFloat(row['Sem 2 Fee']) || null;
      const sem2Schol = parseFloat(row['Sem 2 Scholarship']) || null;
      const sem2After = sem2Fee !== null ? Math.max(0, sem2Fee - (sem2Schol || 0)) : null;

      const sem3Fee = parseFloat(row['Sem 3 Fee']) || null;
      const sem3Schol = parseFloat(row['Sem 3 Scholarship']) || null;
      const sem3After = sem3Fee !== null ? Math.max(0, sem3Fee - (sem3Schol || 0)) : null;

      const sem4Fee = parseFloat(row['Sem 4 Fee']) || null;
      const sem4Schol = parseFloat(row['Sem 4 Scholarship']) || null;
      const sem4After = sem4Fee !== null ? Math.max(0, sem4Fee - (sem4Schol || 0)) : null;

      const sem5Fee = parseFloat(row['Sem 5 Fee']) || null;
      const sem5Schol = parseFloat(row['Sem 5 Scholarship']) || null;
      const sem5After = sem5Fee !== null ? Math.max(0, sem5Fee - (sem5Schol || 0)) : null;

      const sem6Fee = parseFloat(row['Sem 6 Fee']) || null;
      const sem6Schol = parseFloat(row['Sem 6 Scholarship']) || null;
      const sem6After = sem6Fee !== null ? Math.max(0, sem6Fee - (sem6Schol || 0)) : null;

      const lookups = await resolveStudentFeeLookups({
        enrollmentNo: row['Enrollment No'].toString().trim(),
        type: row['Type (UG/PG)'] || null,
        program: row['Program'] || null,
        batch: row['Batch'] || null,
        paymentOption: row['Payment Option'] || null,
      });

      const enrollmentId = lookups.enrollmentId;
      if (!enrollmentId) continue;

      const payload = {
        enrollmentId,
        programId: lookups.programId,
        paymentOptionId: lookups.paymentOptionId,
        batchId: lookups.batchId,
        typeId: lookups.typeId,
        couponName: row['Coupon Name'] || null,
        couponName2: row['Coupon Name 2'] || null,
        couponName3: row['Coupon Name 3'] || row['Coupon 3'] || null,

        sem1Fee,
        sem2Fee,
        sem3Fee,
        sem4Fee,
        sem5Fee,
        sem6Fee,
        sem1Scholarship: sem1Schol,
        sem2Scholarship: sem2Schol,
        sem3Scholarship: sem3Schol,
        sem4Scholarship: sem4Schol,
        sem5Scholarship: sem5Schol,
        sem6Scholarship: sem6Schol,

        sem1FeeAfter: sem1After,
        sem2FeeAfter: sem2After,
        sem3FeeAfter: sem3After,
        sem4FeeAfter: sem4After,
        sem5FeeAfter: sem5After,
        sem6FeeAfter: sem6After,
      };

      await prisma.studentFeeStructure.upsert({
        where: { enrollmentId },
        update: payload,
        create: payload,
      });

      count++;
    }

    return NextResponse.json({ success: true, count });
  } catch (error: unknown) {
    console.error('Student Fee Structure upload error:', error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
