import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

/** Lookup tables now live under Database → Look up tables. */
export default async function TrackerIndexPage() {
  const session = await getSession();
  if (session?.user?.role !== 'ADMIN') {
    redirect('/dashboard');
  }
  redirect('/database');
}
