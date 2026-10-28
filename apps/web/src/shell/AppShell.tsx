import type { Me } from '@nirvana/contracts';
import { playLiquid, playOnce } from '@nirvana/design-system';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';

import { AgentPill } from './AgentPill';
import { NavIcon } from './NavIcon';
import { FAMILY_LABELS, railOf, sectionOf, type NavItem, type Rail } from './nav';

import { HoldProvider } from '@/reports/Hold';

/** What the account is, under its name: a manager on leave has the chatter's rail, and stays a manager. */
function roleLabel(user: Me): string {
  if (user.role === 'owner') return 'Propriétaire';
  if (user.role === 'creator') return 'Créatrice';
  if (user.team === null) return 'Opérateur';
  return user.team.role === 'manager' ? 'Manager' : 'Chatteur';
}

export function AppShell({ user, onSignOut }: { user: Me; onSignOut: () => void }): JSX.Element {
  const rail = useMemo(() => railOf(user), [user]);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = sectionOf(pathname) ?? rail.home;

  // The hold outlives the screens: a report sent on leaving Aujourd'hui says its refusal in Suivi (EQ-03).
  return (
    <HoldProvider>
      <div className="nv-app">
        <div className="nv-ambient" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <RailNav rail={rail} current={current}>
          <UserMenu name={user.name} role={roleLabel(user)} onSignOut={onSignOut} />
        </RailNav>
        <main className="nv-stage" key={current}>
          <Outlet />
        </main>
      </div>
    </HoldProvider>
  );
}

/**
 * The rail of one role: its tabs, the family headings, the agent's mode when the rail has the Dashboard, Réglages at
 * the foot. On the phone it becomes the tab bar, and what does not fit goes under « Plus ».
 */
export function RailNav({
  rail,
  current,
  children,
}: {
  rail: Rail;
  current: string;
  children?: JSX.Element;
}): JSX.Element {
  const railRef = useRef<HTMLElement>(null);
  const lensRef = useRef<HTMLSpanElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const first = useRef(true);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isInMore = [...rail.more].some((to) => to === current);

  // Another tab chosen from the bar while the sheet is open: the sheet goes.
  useEffect(() => {
    setIsMoreOpen(false);
  }, [current]);

  // The lens slides to the active item and squashes on the way; the icon plays its gesture.
  useLayoutEffect(() => {
    const nav = railRef.current;
    const lens = lensRef.current;
    const item = nav?.querySelector<HTMLElement>(`[data-section="${current}"]`);
    if (nav === null || lens === null || item === null || item === undefined) return;
    lens.style.transform = `translateY(${String(item.offsetTop)}px)`;
    if (first.current) {
      first.current = false;
      return;
    }
    playLiquid(lens);
    // On the phone, a tab under « Plus » is hidden: « Plus » plays for it.
    for (const host of isInMore ? [item, moreRef.current] : [item]) {
      const icon = host?.querySelector('svg');
      if (icon !== null && icon !== undefined) playOnce(icon, 'is-playing');
    }
  }, [current, isInMore]);

  const link = (item: NavItem): JSX.Element => (
    <Link
      key={item.to}
      to={item.to}
      data-section={item.to}
      data-phone={rail.more.has(item.to) ? 'more' : 'bar'}
      className="nv-rail__item"
      aria-current={item.to === current ? 'page' : undefined}
      title={item.label}
    >
      <NavIcon name={item.icon} />
      <span className="nv-rail__label">{item.label}</span>
    </Link>
  );

  const home = [...rail.items, ...(rail.settings === null ? [] : [rail.settings])].find(
    ({ to }) => to === rail.home,
  );
  const more = [...rail.items, ...(rail.settings === null ? [] : [rail.settings])].filter(({ to }) =>
    rail.more.has(to),
  );

  return (
    <nav
      className="nv-rail nv-glass"
      ref={railRef}
      aria-label="Navigation"
      data-tabs={rail.items.length + (rail.settings === null ? 0 : 1)}
    >
      <Link to={rail.home} className="nv-rail__brand" aria-label={`Nirvana, ${home?.label ?? 'accueil'}`}>
        <img className="nv-rail__mark" src="/nirvana-mark.svg" alt="" width={30} height={30} />
        <span className="nv-rail__name">Nirvana</span>
      </Link>
      <span className="nv-rail__lens" ref={lensRef} aria-hidden="true" />
      {rail.items.map((item, index) => {
        // The first tab of a family opens it: with a heading, or a gap when the family has that tab alone.
        const opens = item.family === rail.items[index - 1]?.family ? null : item.family;
        return (
          <Fragment key={item.to}>
            {opens !== null ? (
              rail.headed.has(opens) ? (
                <span className="nv-rail__heading">{FAMILY_LABELS[opens]}</span>
              ) : (
                <span className="nv-rail__gap" aria-hidden="true" />
              )
            ) : null}
            {link(item)}
          </Fragment>
        );
      })}
      <span className="nv-rail__sp" />
      {rail.items.some(({ to }) => to === '/') ? <AgentPill /> : null}
      {rail.settings === null ? null : link(rail.settings)}
      {more.length === 0 ? null : (
        <button
          ref={moreRef}
          type="button"
          className="nv-rail__item nv-rail__more"
          aria-haspopup="dialog"
          aria-expanded={isMoreOpen}
          data-current={isInMore}
          onClick={() => {
            setIsMoreOpen(!isMoreOpen);
          }}
        >
          <NavIcon name="more" />
          <span className="nv-rail__label">Plus</span>
        </button>
      )}
      {children}
      {isMoreOpen ? (
        <MoreSheet
          items={more}
          current={current}
          onClose={() => {
            setIsMoreOpen(false);
            moreRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </nav>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled])';

/**
 * What the phone's bar has no room for: a glass sheet over the bar (it floats). A modal dialog: Tab stays inside, Escape
 * or a tap outside closes it, and so does choosing a tab; the focus goes back to « Plus ».
 */
export function MoreSheet({
  items,
  current,
  onClose,
}: {
  items: readonly NavItem[];
  current: string;
  onClose: () => void;
}): JSX.Element {
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const target =
      sheet.current?.querySelector<HTMLElement>('[aria-current="page"]') ??
      sheet.current?.querySelector<HTMLElement>('a[href]');
    target?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close.current();
    };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
    };
  }, []);

  // On the body: the rail's glass would capture `position: fixed`.
  return createPortal(
    <>
      <div className="nv-more-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={sheet}
        className="nv-more nv-glass nv-glass--thick"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nv-more-title"
        onKeyDown={(event) => {
          if (event.key !== 'Tab' || sheet.current === null) return;
          const all = [...sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
          const head = all[0];
          const tail = all[all.length - 1];
          if (head === undefined || tail === undefined) return;
          if (event.shiftKey && document.activeElement === head) {
            event.preventDefault();
            tail.focus();
          } else if (!event.shiftKey && document.activeElement === tail) {
            event.preventDefault();
            head.focus();
          }
        }}
      >
        <h2 className="nv-more__title" id="nv-more-title">
          Plus
        </h2>
        {items.map((item, index) => (
          <Link
            key={item.to}
            to={item.to}
            className="nv-more__item nv-enter"
            style={{ '--nv-i': index + 1 }}
            aria-current={item.to === current ? 'page' : undefined}
            onClick={onClose}
          >
            <NavIcon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </div>
    </>,
    document.body,
  );
}

function UserMenu({
  name,
  role,
  onSignOut,
}: {
  name: string;
  role: string;
  onSignOut: () => void;
}): JSX.Element {
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
        title={name}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className="nv-avatar nv-avatar--sm" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="nv-user__id">
          <span>{name}</span>
          <small>{role}</small>
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
