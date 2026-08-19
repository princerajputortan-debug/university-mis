'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavbarLinks({ role }: { role?: string }) {
  const pathname = usePathname();
  
  const links = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Forms', href: '/admission-form' },
    { name: 'Fee Structure', href: '/student-fee-structure' },
    { name: 'Data Upload', href: '/upload', adminOnly: true },
    { name: 'Reco Tab', href: '/reconciliation', adminOnly: true },
    { name: 'Database', href: '/database', adminOnly: true },
  ];

  return (
    <>
      {links.map((link) => {
        if (link.adminOnly && role !== 'ADMIN') return null;
        const isActive = pathname.startsWith(link.href);
        return (
          <Link
            key={link.name}
            href={link.href}
            className={`nav-link ${isActive ? 'active' : ''}`}
          >
            {link.name}
          </Link>
        );
      })}
    </>
  );
}
