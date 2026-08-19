import { getForms, getPlacementStatuses } from './actions';
import { getSession } from '@/lib/auth';
import Link from 'next/link';
import ExportButton from './ExportButton';
import FilterBar from './FilterBar';
import DeleteButton from './DeleteButton';
import Pagination from './Pagination';
import { formatDateForDisplay } from '@/lib/dates';

export default async function FormsList({ searchParams }: { searchParams?: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined } }) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const pageStr = resolvedSearchParams?.page;
  const pageNum = parseInt(Array.isArray(pageStr) ? pageStr[0] : pageStr || '1', 10);
  
  // Extract filters
  const getFilterVal = (val: string | string[] | undefined) => Array.isArray(val) ? val[0] : val;
  const filters = {
    search: getFilterVal(resolvedSearchParams?.search),
    program: getFilterVal(resolvedSearchParams?.program),
    batch: getFilterVal(resolvedSearchParams?.batch),
    category: getFilterVal(resolvedSearchParams?.category),
    placedStatus: getFilterVal(resolvedSearchParams?.placedStatus),
  };
  
  const [{ data: forms, totalPages, total }, placementStatuses] = await Promise.all([
    getForms(pageNum, 15, filters),
    getPlacementStatuses(),
  ]);
  const session = await getSession();

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>Admission Forms</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage and view student admission records</p>
        </div>
        {session?.user?.role === 'ADMIN' && (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <ExportButton />
            <Link href="/upload" className="btn btn-secondary">
              Upload CSV
            </Link>
            <Link href="/admission-form/new" className="btn btn-primary">
              + New Admission Form
            </Link>
          </div>
        )}
      </div>

      <FilterBar placementStatuses={placementStatuses} />

      <div className="glass-panel" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>Enrollment No</th>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>Date of Admission</th>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>Program</th>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>Batch</th>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>Total Fee</th>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>Recd Fee</th>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>Pending Fee</th>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>Category</th>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>Placed Status</th>
              <th style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {forms.map((form) => (
              <tr key={form.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>{form.enrollmentNo}</td>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>{formatDateForDisplay(form.doa) || '-'}</td>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>{form.program}</td>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>{form.batch}</td>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>₹ {form.totalFee?.toLocaleString() || 0}</td>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)', color: 'var(--success-color)' }}>₹ {form.recdFee?.toLocaleString() || 0}</td>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)', color: 'var(--error-color)' }}>₹ {form.pendingFee?.toLocaleString() || 0}</td>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ 
                    padding: '0.25rem 0.5rem', 
                    borderRadius: '4px', 
                    fontSize: '0.75rem',
                    background: form.category === 'Full Fee' ? 'rgba(16, 185, 129, 0.2)' : 
                              form.category === 'Excess Fee' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: form.category === 'Full Fee' ? '#34d399' : 
                           form.category === 'Excess Fee' ? '#60a5fa' : '#f87171'
                  }}>
                    {form.category}
                  </span>
                </td>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>{form.placedStatus || '-'}</td>
                <td style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <Link href={`/admission-form/${form.id}`} style={{ color: 'var(--primary-color)' }}>
                      {session?.user?.role === 'ADMIN' ? 'Edit' : 'View'}
                    </Link>
                    {session?.user?.role === 'ADMIN' && (
                      <DeleteButton id={form.id} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {forms.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                  No admission forms found.
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
