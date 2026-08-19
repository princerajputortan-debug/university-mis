import Link from 'next/link';
import { getSession, logout } from '@/lib/auth';
import { redirect } from 'next/navigation';
import NavbarLinks from './NavbarLinks';
import NavbarScroll from './NavbarScroll';
import ThemeToggle from './ThemeToggle';

export default async function Navbar() {
  const session = await getSession();

  const handleLogout = async () => {
    'use server';
    await logout();
    redirect('/login');
  };

  const getInitials = (email: string) => {
    if (!email) return 'AD';
    return email.substring(0, 2).toUpperCase();
  };

  return (
    <>
      <NavbarScroll />
      <nav className="navbar" id="navbar">
        <Link href="/dashboard" className="nav-brand">
          <span className="nav-brand-name">UnivMIS</span>
        </Link>
        
        <div className="nav-links">
          <NavbarLinks role={session?.user?.role} />
        </div>
        
        <div className="nav-right">
          <div className="nav-email">
            {session?.user?.email || 'admin@univ.edu'}<br />
            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              {session?.user?.role === 'ADMIN' ? 'Administrator' : 'User'}
            </span>
          </div>
          {session?.user?.role === 'ADMIN' && (
            <span className="nav-role">Admin</span>
          )}
          <div className="nav-avatar">{getInitials(session?.user?.email || '')}</div>
          
          <ThemeToggle />

          <form action={handleLogout}>
            <button 
              type="submit" 
              className="nav-logout"
              title="Logout"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0 }}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </form>
        </div>
      </nav>
    </>
  );
}
