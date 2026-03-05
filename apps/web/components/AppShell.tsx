'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { useLogout } from '../lib/useAuth';

type AppShellProps = {
  children: ReactNode;
};

type NavLink = {
  href: string;
  label: string;
};

const NAV_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/students', label: 'Students' },
  { href: '/curriculum', label: 'Curriculum' },
  { href: '/attempts', label: 'Attempts' },
];

function isLoginPath(pathname: string): boolean {
  return pathname === '/login';
}

function isActiveLink(pathname: string, href: string): boolean {
  if (href === '/students') {
    return pathname === '/students' || pathname.startsWith('/students/');
  }

  if (href === '/curriculum') {
    return pathname === '/curriculum' || pathname.startsWith('/curriculum/');
  }

  if (href === '/attempts') {
    return pathname === '/attempts' || pathname.startsWith('/attempts/');
  }

  return pathname === href;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const onLogout = useLogout();

  if (isLoginPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="appShell">
      <header className="topNav">
        <div className="topNavInner">
          <nav className="topNavLinks" aria-label="Main navigation">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={isActiveLink(pathname, link.href) ? 'topNavLink active' : 'topNavLink'}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <button className="buttonSecondary" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>
      <div>{children}</div>
    </div>
  );
}
