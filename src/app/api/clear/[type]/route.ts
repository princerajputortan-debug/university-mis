import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function DELETE(req: NextRequest, context: { params: Promise<{ type: string }> }) {
  try {
    const session = await getSession();
    if (session?.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type } = await context.params;
    const { searchParams } = new URL(req.url);

    switch (type) {
      case 'form':
        await prisma.admissionForm.deleteMany({});
        return NextResponse.json({ success: true, message: 'All Admission Forms cleared.' });

      case 'fee':
        await prisma.feeStructure.deleteMany({});
        return NextResponse.json({ success: true, message: 'Fee Structure cleared.' });

      case 'razorpay':
        await prisma.razorpayPayment.deleteMany({});
        await prisma.consolidatedPayment.deleteMany({ where: { sourceName: 'Razorpay' } });
        return NextResponse.json({ success: true, message: 'Razorpay payments cleared.' });

      case 'jodo':
        await prisma.jodoPayment.deleteMany({});
        await prisma.consolidatedPayment.deleteMany({ where: { sourceName: 'Jodo' } });
        return NextResponse.json({ success: true, message: 'Jodo payments cleared.' });

      case 'early':
        await prisma.earlyPayment.deleteMany({});
        await prisma.consolidatedPayment.deleteMany({ where: { sourceName: 'Early' } });
        return NextResponse.json({ success: true, message: 'Early payments cleared.' });

      case 'offline':
        await prisma.offlinePayment.deleteMany({});
        await prisma.consolidatedPayment.deleteMany({ where: { sourceName: 'Offline' } });
        return NextResponse.json({ success: true, message: 'Offline payments cleared.' });

      case 'bank':
        await prisma.bankPayment.deleteMany({});
        await prisma.consolidatedPayment.deleteMany({ where: { sourceName: 'Bank' } });
        return NextResponse.json({ success: true, message: 'Bank payments cleared.' });

      case 'propelld':
        await prisma.propelldPayment.deleteMany({});
        await prisma.consolidatedPayment.deleteMany({ where: { sourceName: 'Propelld' } });
        return NextResponse.json({ success: true, message: 'Propelld payments cleared.' });

      case 'others':
        await prisma.othersPayment.deleteMany({});
        await prisma.consolidatedPayment.deleteMany({ where: { sourceName: 'Corp Inst' } });
        return NextResponse.json({ success: true, message: 'Corp Inst payments cleared.' });

      case 'misc':
        await prisma.miscPayment.deleteMany({});
        // Cleanup any leftover Misc rows if previously mirrored to ConsolidatedPayment
        await prisma.consolidatedPayment.deleteMany({ where: { sourceName: 'Misc' } });
        return NextResponse.json({ success: true, message: 'Misc payments cleared.' });

      case 'all-payments':
        // Clear all source tables + consolidated
        await prisma.razorpayPayment.deleteMany({});
        await prisma.jodoPayment.deleteMany({});
        await prisma.earlyPayment.deleteMany({});
        await prisma.offlinePayment.deleteMany({});
        await prisma.bankPayment.deleteMany({});
        await prisma.propelldPayment.deleteMany({});
        await prisma.othersPayment.deleteMany({});
        await prisma.miscPayment.deleteMany({});
        await prisma.consolidatedPayment.deleteMany({});
        return NextResponse.json({ success: true, message: 'All payment sources cleared.' });

      case 'consolidated-payout':
        {
          const category = searchParams.get('category')?.trim();
          if (category) {
            await prisma.$executeRawUnsafe(
              'DELETE FROM consolidated_payout WHERE category = ?',
              category
            );
            return NextResponse.json({
              success: true,
              message: `Consolidated payout cleared for category ${category}.`,
            });
          }
          await prisma.$executeRawUnsafe('DELETE FROM consolidated_payout');
          return NextResponse.json({ success: true, message: 'Consolidated payout cleared.' });
        }

      default:
        return NextResponse.json({ error: 'Invalid clear type' }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error('Clear Error:', error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
