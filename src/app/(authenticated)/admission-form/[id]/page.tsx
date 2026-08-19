import FormEditor from '../FormEditor';
import { getForm, getPlacementStatuses } from '../actions';
import { getSession } from '@/lib/auth';
import Link from 'next/link';

export default async function AdmissionFormDetail(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [placementStatuses, initialData] = await Promise.all([
    getPlacementStatuses(),
    id !== 'new' ? getForm(id) : Promise.resolve(null),
  ]);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Link href="/admission-form" className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
          &larr; Back
        </Link>
        <div>
          <h1 style={{ margin: 0 }}>
            {id === 'new' ? 'Create New Admission Form' : `Edit Form: ${initialData?.enrollmentNo || id}`}
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            {isAdmin ? 'Fill in the details below. Dependent fields calculate automatically.' : 'Viewing mode only.'}
          </p>
        </div>
      </div>

      <FormEditor
        initialData={initialData ?? undefined}
        isAdmin={isAdmin}
        placementStatuses={placementStatuses}
      />
    </div>
  );
}
