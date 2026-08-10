import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../../lib/appContext';
import { Avatar, Button, Modal, ThemeToggle, Wordmark } from '../ui';
import { cn } from '../../lib/cn';

const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard', icon: '🏠', end: true },
  { to: '/app/decks', label: 'My Decks', icon: '🗂️' },
  { to: '/app/stats', label: 'Stats', icon: '📊' },
  { to: '/app/settings', label: 'Settings', icon: '⚙️' },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const app = useApp();
  const navigate = useNavigate();
  const user = app.authStore((s) => s.session?.user);
  const signOut = app.authStore((s) => s.signOut);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unsyncedWarning, setUnsyncedWarning] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  /**
   * Signing out clears this device's decks and history, so anything that has
   * not reached the server is gone with it. `signOut` pushes first and reports
   * false when it could not — being offline, usually — and that is a decision
   * for the person holding the unsaved work, not for us.
   */
  async function handleSignOut() {
    setSigningOut(true);
    const done = await signOut();
    setSigningOut(false);
    if (done) {
      navigate('/');
      return;
    }
    setMenuOpen(false);
    setUnsyncedWarning(true);
  }

  async function signOutAnyway() {
    setSigningOut(true);
    await signOut({ force: true });
    setSigningOut(false);
    setUnsyncedWarning(false);
    navigate('/');
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <SidebarContent onNavigate={() => {}} />
      </aside>

      {/* Mobile sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative z-10 flex h-full w-64 flex-col bg-white dark:bg-slate-900">
            <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 lg:px-8">
          <button
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <div className="hidden lg:block" />
          <ThemeToggle className="ml-auto mr-1" />
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {user && <Avatar name={user.username} initials={user.initials} avatarUrl={user.avatarUrl} size="sm" />}
              <span className="hidden text-sm font-medium text-slate-700 dark:text-slate-200 sm:block">
                @{user?.username}
              </span>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-soft dark:border-slate-800 dark:bg-slate-900">
                  <NavLink
                    to="/app/settings"
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => setMenuOpen(false)}
                  >
                    Settings
                  </NavLink>
                  <button
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                    className="block w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    {signingOut ? 'Saving your work…' : 'Sign out'}
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      <Modal
        open={unsyncedWarning}
        onClose={() => setUnsyncedWarning(false)}
        title="Some changes haven’t saved yet"
        description="We couldn’t reach the server to save your most recent work."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setUnsyncedWarning(false)}>
              Stay signed in
            </Button>
            <Button variant="danger" onClick={() => void signOutAnyway()} disabled={signingOut}>
              Sign out and lose them
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Signing out clears this device, so anything not yet saved to your account would be lost.
          Staying signed in until you&apos;re back online is usually what you want — it saves on its
          own once the connection returns.
        </p>
      </Modal>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  return (
    <>
      <div className="flex h-16 items-center border-b border-slate-200 px-6 dark:border-slate-800">
        <Wordmark className="text-lg" />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-4 dark:border-slate-800">
        <NavLink
          to="/app/decks/new"
          onClick={onNavigate}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity brand-gradient hover:opacity-90"
        >
          <span>+</span> New deck
        </NavLink>
      </div>
    </>
  );
}
