import type { CurrentUser } from '@nirvana/contracts';
import { playLiquid, playOnce } from '@nirvana/design-system';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';

import { AgentPill } from './AgentPill';
import { NavIcon, type NavIconName } from './NavIcon';

interface NavItem {
  readonly to: '/' | '/creatrices' | '/entrainer' | '/suivi' | '/reglages';
  readonly label: string;
  readonly icon: NavIconName;
}

/** The whole navigation (no Inbox, no Fans: the agent works in Reveal, the dashboard supervises it). */
const NAV: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/creatrices', label: 'Créatrices', icon: 'creators' },
  { to: '/entrainer', label: 'Entraîner', icon: 'train' },
  { to: '/suivi', label: 'Suivi', icon: 'tracking' },
];
const SETTINGS: NavItem = { to: '/reglages', label: 'Réglages', icon: 'settings' };

const ROLE_LABELS: Readonly<Record<CurrentUser['role'], string>> = {
  owner: 'Propriétaire',
  operator: 'Opérateur',
  creator: 'Créatrice',
};

export function sectionOf(pathname: string): NavItem['to'] {
  const first = `/${pathname.split('/')[1] ?? ''}`;
  return [...NAV, SETTINGS].find((item) => item.to === first)?.to ?? '/';
}

export function AppShell({ user, onSignOut }: { user: CurrentUser; onSignOut: () => void }): JSX.Element {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = sectionOf(pathname);
  const railRef = useRef<HTMLElement>(null);
  const lensRef = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  // The lens slides to the active item and squashes on the way; the icon plays its gesture.
  useLayoutEffect(() => {
    const rail = railRef.current;
    const lens = lensRef.current;
    const item = rail?.querySelector<HTMLElement>(`[data-section="${current}"]`);
    if (rail === null || lens === null || item === null || item === undefined) return;
    lens.style.transform = `translateY(${String(item.offsetTop)}px)`;
    if (first.current) {
      first.current = false;
      return;
    }
    playLiquid(lens);
    const icon = item.querySelector('svg');
    if (icon !== null) playOnce(icon, 'is-playing');
  }, [current]);

  const link = (item: NavItem): JSX.Element => (
    <Link
      key={item.to}
      to={item.to}
      data-section={item.to}
      className="nv-rail__item"
      aria-current={item.to === current ? 'page' : undefined}
      title={item.label}
    >
      <NavIcon name={item.icon} />
      <span className="nv-rail__label">{item.label}</span>
    </Link>
  );

  return (
    <div className="nv-app">
      <div className="nv-ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <nav className="nv-rail nv-glass" ref={railRef} aria-label="Navigation">
        <Link to="/" className="nv-rail__brand" aria-label="Nirvana, Dashboard">
          <img className="nv-rail__mark" src="/nirvana-mark.svg" alt="" width={30} height={30} />
          <span className="nv-rail__name">Nirvana</span>
        </Link>
        <span className="nv-rail__lens" ref={lensRef} aria-hidden="true" />
        {NAV.map(link)}
        <span className="nv-rail__sp" />
        <AgentPill />
        {link(SETTINGS)}
        <UserMenu user={user} onSignOut={onSignOut} />
      </nav>
      <main className="nv-stage" key={current}>
        <Outlet />
      </main>
    </div>
  );
}

function UserMenu({ user, onSignOut }: { user: CurrentUser; onSignOut: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent | KeyboardEvent): void => {
      const outside = event.target instanceof Node && ref.current?.contains(event.target) !== true;
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : outside) setOpen(false);
    };
    addEventListener('pointerdown', close);
    addEventListener('keydown', close);
    return () => {
      removeEventListener('pointerdown', close);
      removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="nv-user" ref={ref}>
      <button
        type="button"
        className="nv-user__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.name}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className="nv-avatar nv-avatar--sm" aria-hidden="true">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="nv-user__id">
          <span>{user.name}</span>
          <small>{ROLE_LABELS[user.role]}</small>
        </span>
      </button>
      {open ? (
        <div className="nv-user__menu nv-glass nv-glass--thick" role="menu">
          <button
            type="button"
            role="menuitem"
            className="nv-btn nv-btn--plain nv-btn--sm"
            onClick={onSignOut}
          >
            Se déconnecter
          </button>
        </div>
      ) : null}
    </div>
  );
}
