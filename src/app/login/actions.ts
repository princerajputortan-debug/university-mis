'use server'

import { prisma } from '@/lib/prisma';
import { login as setSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export async function loginUser(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || user.password !== password) {
    return { error: 'Invalid email or password' };
  }

  await setSession({ id: user.id, email: user.email, role: user.role });
  redirect('/dashboard');
}
