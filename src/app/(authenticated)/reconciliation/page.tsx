import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import RecoTable from './RecoTable';

export const dynamic = 'force-dynamic';

export default async function ReconciliationPage() {
  const session = await getSession();
  if (session?.user?.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const recoRows = await prisma.consolidatedPayment.findMany({
    where: {
      enrollmentId: null,
      // Misc is collection-only and must never appear on Reco
      NOT: { sourceName: 'Misc' },
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: { batch: true },
  });

  const recoPayments = recoRows.map(p => ({
    id: p.id,
    transactionId: p.transactionId,
    date: p.date,
    amount: p.amount,
    sourceName: p.sourceName,
    mode: p.mode,
    batch: p.batch?.batch ?? null,
  }));

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '2rem' }}>🔍</span>
          Reconciliation Dashboard
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Manage and resolve transactions that were uploaded without an assigned enrollment number.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Pending Resolutions ({recoPayments.length})</h2>
        </div>

        {recoPayments.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem 1rem', 
            color: 'var(--text-muted)',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '8px',
            border: '1px dashed rgba(255,255,255,0.1)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'white' }}>All Caught Up!</h3>
            <p>There are no transactions pending reconciliation.</p>
          </div>
        ) : (
          <RecoTable initialData={recoPayments} />
        )}
      </div>
    </div>
  );
}
