import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getTrackerTable } from '@/lib/tracker-tables';
import { getTrackerRows } from '../actions';
import TrackerTableClient from './TrackerTableClient';

export const dynamic = 'force-dynamic';

export default async function TrackerTablePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (session?.user?.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const { slug } = await params;
  const config = getTrackerTable(slug);
  if (!config) notFound();

  const rows = await getTrackerRows(slug);
  if (!rows) notFound();

  return <TrackerTableClient config={config} initialRows={rows} />;
}
