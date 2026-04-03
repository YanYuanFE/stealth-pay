import { Outlet, Link, useLocation } from 'react-router-dom';
import ConnectWallet from '../ConnectWallet';
import { useTheme } from '../../hooks/useTheme';
import { Button } from '@/components/ui/button';

const PAGE_TITLES: Record<string, string> = {
  '/employer/dashboard': 'Dashboard',
  '/employer/fund': 'Fund',
  '/employer/employees': 'Employees',
  '/employer/payroll': 'Run Payroll',
  '/employer/history': 'History',
  '/employee/portal': 'My Salary',
  '/employee/setup': 'Setup',
  '/auditor/portal': 'Audit',
};

export default function Layout() {
  const { pathname } = useLocation();
  const isRoot =
    pathname === '/employer/dashboard' || pathname === '/employee/portal' || pathname === '/auditor/portal';
  const parentPath = pathname.startsWith('/employer')
    ? '/employer/dashboard'
    : pathname.startsWith('/auditor')
      ? '/auditor/portal'
      : '/employee/portal';
  const pageTitle = PAGE_TITLES[pathname];
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg)]">
      <header className="bg-[var(--bg)]/60 backdrop-blur-xl border-b border-[var(--border)] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Left: logo + breadcrumb */}
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 text-lg font-serif font-medium text-[var(--fg)]"
            >
              <img
                src={theme === 'dark' ? '/stealthpay-icon-dark.png' : '/stealthpay-icon-light.png'}
                alt=""
                className="size-7 rounded-lg"
              />
              StealthPay
            </Link>
            {!isRoot && pageTitle && (
              <>
                <span className="text-[var(--fg-faint)]">/</span>
                <Link
                  to={parentPath}
                  className="text-sm text-[var(--fg-faint)] hover:text-[var(--fg-muted)]"
                >
                  {pathname.startsWith('/employer') ? 'Dashboard' : 'Portal'}
                </Link>
                <span className="text-[var(--fg-faint)]">/</span>
                <span className="text-sm text-[var(--fg)] font-medium">
                  {pageTitle}
                </span>
              </>
            )}
          </div>

          {/* Right: theme toggle + wallet */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label="Toggle theme"
              className="text-[var(--fg-muted)] hover:bg-[var(--bg-elevated)]"
            >
              {theme === 'dark' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
              )}
            </Button>
            <ConnectWallet />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
