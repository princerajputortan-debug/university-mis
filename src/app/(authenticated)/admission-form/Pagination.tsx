'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function Pagination({ page, totalPages, total }: { page: number, totalPages: number, total: number }) {
  const searchParams = useSearchParams();
  
  const createPageUrl = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    return `/admission-form?${params.toString()}`;
  };

  if (totalPages <= 1 && total === 0) return null;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        Showing page <strong>{page}</strong> of <strong>{totalPages || 1}</strong> ({total} total records)
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {page > 1 ? (
          <Link href={createPageUrl(page - 1)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
            Previous
          </Link>
        ) : (
          <button className="btn btn-secondary" disabled style={{ padding: '0.5rem 1rem', opacity: 0.5, cursor: 'not-allowed' }}>
            Previous
          </button>
        )}
        
        {page < totalPages ? (
          <Link href={createPageUrl(page + 1)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
            Next
          </Link>
        ) : (
          <button className="btn btn-secondary" disabled style={{ padding: '0.5rem 1rem', opacity: 0.5, cursor: 'not-allowed' }}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}
