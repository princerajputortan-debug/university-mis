import { getSession } from '@/lib/auth';
import { getStudentFeeStructure } from '../actions';
import FeeStructureEditor from '../FeeStructureEditor';
import Link from 'next/link';

export default async function FeeStructurePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const session = await getSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const isNew = resolvedParams.id === 'new';
  const initialData = isNew ? null : await getStudentFeeStructure(resolvedParams.id);

  if (!isNew && !initialData) {
    return (
      <div className="animate-fade-in">
        <h1>Fee Structure Not Found</h1>
        <Link href="/student-fee-structure" className="btn btn-secondary mt-4">Back to list</Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/student-fee-structure" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </Link>
        <h1>{isNew ? 'New Fee Structure' : `Edit Fee Structure: ${initialData?.enrollmentNo || resolvedParams.id}`}</h1>
        <p style={{ color: 'var(--text-muted)' }}>Fill in the details below. Fee after deduction calculates automatically.</p>
      </div>

      <FeeStructureEditor initialData={initialData} isAdmin={isAdmin} />
    </div>
  );
}
