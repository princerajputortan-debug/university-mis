import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from '@/lib/auth';

export async function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get('session')?.value;
  
  const isLoginPage = request.nextUrl.pathname.startsWith('/login');

  if (!sessionCookie && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (sessionCookie) {
    try {
      const payload = await decrypt(sessionCookie);
      if (!payload && !isLoginPage) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      if (payload && isLoginPage) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    } catch {
      if (!isLoginPage) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
    }
  }

  // Rewrite / to /dashboard for authenticated users
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
