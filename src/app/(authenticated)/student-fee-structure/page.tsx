import { getStudentFeeStructuresDetailed } from './actions';
import { getSession } from '@/lib/auth';
import Link from 'next/link';
import Pagination from '@/app/(authenticated)/admission-form/Pagination';

function formatCurrency(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const thStyle: React.CSSProperties = {
  padding: '0.75rem',
  border: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
  fontSize: '0.8rem',
};

const tdStyle: React.CSSProperties = {
  padding: '0.75rem',
  border: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
  fontSize: '0.85rem',
};

export default async function StudentFeeStructureList({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined };
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const pageStr = resolvedSearchParams?.page;
  const pageNum = parseInt(Array.isArray(pageStr) ? pageStr[0] : pageStr || '1', 10);

  const getFilterVal = (val: string | string[] | undefined) => (Array.isArray(val) ? val[0] : val);
  const filters = {
    program: getFilterVal(resolvedSearchParams?.program),
    batch: getFilterVal(resolvedSearchParams?.batch),
  };

  const { data: feeStructures, totalPages, total } = await getStudentFeeStructuresDetailed(
    pageNum,
    15,
    filters
  );
  const session = await getSession();

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>Student Fee Structure</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Detailed fee view with base structure, collections, and scholarship totals
          </p>
        </div>
        {session?.user?.role === 'ADMIN' && (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <a href="/api/student-fee-structure/template" className="btn btn-secondary">
              Download Template
            </a>
            <Link href="/student-fee-structure/new" className="btn btn-primary">
              + New Fee Structure
            </Link>
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1600px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
              <th style={thStyle}>Enrollment id</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Payment option</th>
              <th style={thStyle}>Program</th>
              <th style={thStyle}>Batch</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Current Sem</th>
              <th style={thStyle}>Fee Structure</th>
              <th style={thStyle}>Fee - current sem</th>
              <th style={thStyle}>Recd Till Date</th>
              <th style={thStyle}>Pending</th>
              <th style={thStyle}>Gross fee</th>
              <th style={thStyle}>Scholarship - current sem</th>
              <th style={thStyle}>Gross Scholarship</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {feeStructures.map((fs) => (
              <tr key={fs.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={tdStyle}>{fs.enrollmentId}</td>
                <td style={tdStyle}>{fs.name}</td>
                <td style={tdStyle}>{fs.paymentOption}</td>
                <td style={tdStyle}>{fs.program}</td>
                <td style={tdStyle}>{fs.batch}</td>
                <td style={tdStyle}>{fs.type}</td>
                <td style={tdStyle}>{fs.currentSem || '-'}</td>
                <td style={tdStyle}>{formatCurrency(fs.feeStructurePerSem)}</td>
                <td style={tdStyle}>{formatCurrency(fs.feeCurrentSem)}</td>
                <td style={tdStyle}>{formatCurrency(fs.recdTillDate)}</td>
                <td style={{ ...tdStyle, color: fs.pending > 0 ? '#f59e0b' : 'inherit' }}>
                  {formatCurrency(fs.pending)}
                </td>
                <td style={tdStyle}>{formatCurrency(fs.grossFee)}</td>
                <td style={tdStyle}>{formatCurrency(fs.scholarshipCurrentSem)}</td>
                <td style={tdStyle}>{formatCurrency(fs.grossScholarship)}</td>
                <td style={tdStyle}>
                  <Link href={`/student-fee-structure/${fs.id}`} style={{ color: 'var(--primary-color)' }}>
                    {session?.user?.role === 'ADMIN' ? 'Edit' : 'View'}
                  </Link>
                </td>
              </tr>
            ))}
            {feeStructures.length === 0 && (
              <tr>
                <td
                  colSpan={15}
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  No fee structures found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination page={pageNum} totalPages={totalPages} total={total} />
      </div>
    </div>
  );
}
