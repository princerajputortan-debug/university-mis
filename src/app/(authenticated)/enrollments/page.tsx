import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined };
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const page = Math.max(1, parseInt(getParam(resolvedSearchParams?.page) || '1', 10) || 1);
  const q = (getParam(resolvedSearchParams?.q) || '').trim();
  const limit = 50;
  const skip = (page - 1) * limit;

  const where = q
    ? {
        enrollment: {
          contains: q,
        },
      }
    : {};

  const [enrollments, total] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      orderBy: { id: 'asc' },
      skip,
      take: limit,
    }),
    prisma.enrollment.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const makePageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('page', String(nextPage));
    return `/enrollments?${params.toString()}`;
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <h1>Enrollments</h1>
          <p style={{ color: 'var(--text-muted)' }}>Master enrollment records imported from Software.csv</p>
        </div>
        <div className="stat-card" style={{ minWidth: '180px' }}>
          <div className="stat-card-top">
            <span className="stat-label">Total Enrollments</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>
            {total.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <form method="GET" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Search Enrollment
            </label>
            <input type="text" name="q" defaultValue={q} className="form-input" placeholder="e.g. PGO202233260" />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>Search</button>
          {q && (
            <Link href="/enrollments" className="btn btn-secondary" style={{ padding: '0.75rem 1rem' }}>Clear</Link>
          )}
        </form>
      </div>

      <div className="glass-panel" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>ID</th>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>Enrollment</th>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>Prefix</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>{item.id}</td>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)', fontWeight: 600 }}>{item.enrollment}</td>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>{item.prefix || '-'}</td>
              </tr>
            ))}
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                  No enrollment records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Showing page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total.toLocaleString('en-IN')} total records)
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {page > 1 ? (
              <Link href={makePageHref(page - 1)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>Previous</Link>
            ) : (
              <button className="btn btn-secondary" disabled style={{ padding: '0.5rem 1rem', opacity: 0.5, cursor: 'not-allowed' }}>Previous</button>
            )}
            {page < totalPages ? (
              <Link href={makePageHref(page + 1)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>Next</Link>
            ) : (
              <button className="btn btn-secondary" disabled style={{ padding: '0.5rem 1rem', opacity: 0.5, cursor: 'not-allowed' }}>Next</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
