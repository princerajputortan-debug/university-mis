import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { countPaymentTableRows, isLegacyPaymentModel, usesPaymentRawQueries } from '@/lib/legacy-payment-tables';
import { prismaDelegate } from '@/lib/prisma-delegate';
import { TRACKER_TABLES } from '@/lib/tracker-tables';

export const dynamic = 'force-dynamic';

async function modelCount(modelName: string, prismaModel: { count: () => Promise<number> }) {
  if (isLegacyPaymentModel(modelName)) {
    try {
      if (await usesPaymentRawQueries(modelName)) {
        return await countPaymentTableRows(modelName);
      }
    } catch {
      return 0;
    }
  }
  return prismaModel.count().catch(() => 0);
}

export default async function DatabaseIndex() {
  const [
    admissionFormCount,
    bankPaymentCount,
    consolidatedPaymentCount,
    earlyPaymentCount,
    enrollmentCount,
    feeStructureCount,
    jodoPaymentCount,
    offlinePaymentCount,
    othersPaymentCount,
    miscPaymentCount,
    propelldPaymentCount,
    razorpayPaymentCount,
    studentFeeStructureCount,
    leadSourcePayoutCount,
    leadSourcePayoutSummaryCount,
  ] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ c: bigint }>>('SELECT COUNT(*) AS c FROM AdmissionForm').then(
      (rows) => Number(rows[0]?.c ?? 0)
    ),
    modelCount('bankPayment', prisma.bankPayment),
    prisma.consolidatedPayment.count().catch(() => 0),
    modelCount('earlyPayment', prisma.earlyPayment),
    prisma.enrollment.count().catch(() => 0),
    prisma.feeStructure.count().catch(() => 0),
    modelCount('jodoPayment', prisma.jodoPayment),
    modelCount('offlinePayment', prisma.offlinePayment),
    modelCount('othersPayment', prisma.othersPayment),
    prisma.miscPayment.count().catch(() => 0),
    modelCount('propelldPayment', prisma.propelldPayment),
    modelCount('razorpayPayment', prisma.razorpayPayment),
    prisma.studentFeeStructure.count().catch(() => 0),
    prisma.leadSourcePayout.count().catch(() => 0),
    prisma.leadSourcePayoutSummary.count().catch(() => 0),
  ]);

  const lookupCounts = await Promise.all(
    TRACKER_TABLES.map(async (item) => {
      try {
        const count = await prismaDelegate(item.prismaModel).count();
        return { ...item, count };
      } catch {
        return { ...item, count: 0 };
      }
    })
  );

  const models = [
    { name: 'AdmissionForm', count: admissionFormCount, href: '/admission-form' },
    { name: 'BankPayment', count: bankPaymentCount, href: '/database/bankPayment' },
    { name: 'ConsolidatedPayment', count: consolidatedPaymentCount, href: '/database/consolidatedPayment' },
    { name: 'EarlyPayment', count: earlyPaymentCount, href: '/database/earlyPayment' },
    { name: 'Enrollment', count: enrollmentCount, href: '/database/enrollment' },
    { name: 'FeeStructure', count: feeStructureCount, href: '/database/feeStructure' },
    { name: 'JodoPayment', count: jodoPaymentCount, href: '/database/jodoPayment' },
    { name: 'MiscPayment', count: miscPaymentCount, href: '/database/miscPayment' },
    { name: 'OfflinePayment', count: offlinePaymentCount, href: '/database/offlinePayment' },
    { name: 'OthersPayment', count: othersPaymentCount, href: '/database/othersPayment' },
    { name: 'PropelldPayment', count: propelldPaymentCount, href: '/database/propelldPayment' },
    { name: 'RazorpayPayment', count: razorpayPaymentCount, href: '/database/razorpayPayment' },
    { name: 'LeadSourcePayout', count: leadSourcePayoutCount, href: '/database/leadSourcePayout' },
    { name: 'LeadSourcePayoutSummary', count: leadSourcePayoutSummaryCount, href: '/database/leadSourcePayoutSummary' },
    { name: 'StudentFeeStructure', count: studentFeeStructureCount, href: '/student-fee-structure' },
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '2rem' }}>
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.5rem' }}>Open a Model</h1>
        
        <div style={{ marginBottom: '2rem' }}>
          <input 
            type="text" 
            placeholder="Search" 
            className="form-input" 
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} 
            disabled 
          />
        </div>

        <div>
          <h3 style={{ fontSize: '1rem', color: 'var(--text-main)', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
            All Models
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {models.map(model => (
              <li key={model.name}>
                <Link 
                  href={model.href}
                  className="model-link"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    color: 'var(--text-main)',
                    textDecoration: 'none'
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{model.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{model.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--text-main)', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
            Look up tables
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {lookupCounts.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/tracker/${item.slug}`}
                  className="model-link"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    color: 'var(--text-main)',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{item.title}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{item.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
