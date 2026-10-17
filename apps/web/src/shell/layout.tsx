import { placeTabBarLens } from '@nirvana/design-system';
import { Link, useRouterState, type LinkProps } from '@tanstack/react-router';
import { useLayoutEffect, useRef, type JSX, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Layout pieces shared by every screen of the dashboard. A screen is a `Page`: a header that says where
 * you are and what to do, then glass `Panel`s. Sections with several screens put a `SubNav` in the header.
 */

export function Page({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={cn('nv-page', className)}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** One sentence: what this screen is for, or the one thing to do here. */
  lead?: ReactNode;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <header className="nv-page__head">
      <div className="nv-page__title">
        {eyebrow === undefined ? null : <p className="nv-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {lead === undefined ? null : <p className="nv-page__lead">{lead}</p>}
      </div>
      {actions === undefined ? null : <div className="nv-page__actions">{actions}</div>}
    </header>
  );
}

/** @public Shared with the screens of other threads (Réglages > Modèles IA). */
export function Panel({
  title,
  eyebrow,
  actions,
  children,
  className,
  as: Tag = 'section',
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: 'section' | 'aside' | 'main' | 'div';
}): JSX.Element {
  const hasHead = title !== undefined || eyebrow !== undefined || actions !== undefined;
  return (
    <Tag className={cn('nv-glass nv-panel', className)}>
      {hasHead ? (
        <div className="nv-panel__head">
          <div className="min-w-0 flex-1">
            {eyebrow === undefined ? null : <p className="nv-eyebrow">{eyebrow}</p>}
            {title === undefined ? null : <h2>{title}</h2>}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}

/** @public A labelled block inside a panel, separated from the previous one by a hairline. */
export function PanelSection({
  label,
  children,
  className,
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('nv-panel__sec', className)}>
      {label === undefined ? null : <p className="nv-eyebrow">{label}</p>}
      {children}
    </div>
  );
}

export interface SubNavItem {
  readonly to: NonNullable<LinkProps['to']>;
  readonly label: string;
  /** A count that asks for action (corrections to sort), shown as a badge. */
  readonly count?: number;
}

/** The screens of a section, as tabs. The active one follows the URL; its glass slides from tab to tab. */
export function SubNav({ items, label }: { items: readonly SubNavItem[]; label: string }): JSX.Element {
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const navRef = useRef<HTMLElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector('[aria-current="page"]');
    if (nav === null || !(active instanceof HTMLElement)) return;
    const thumb = thumbRef.current ?? undefined;
    if (placed.current) {
      placeTabBarLens(nav, active, thumb);
      return;
    }
    // First paint: the thumb appears in place, without sliding in from the left or squashing.
    thumb?.style.setProperty('transition', 'none');
    placeTabBarLens(nav, active);
    thumb?.getBoundingClientRect();
    thumb?.style.removeProperty('transition');
    placed.current = true;
  }, [pathname]);

  return (
    <nav className="nv-subnav" aria-label={label} ref={navRef}>
      <span className="nv-subnav__thumb" ref={thumbRef} aria-hidden="true" />
      {items.map((item) => (
        <Link key={item.to} to={item.to} className="nv-subnav__item" activeProps={{ 'aria-current': 'page' }}>
          {item.label}
          {item.count === undefined || item.count === 0 ? null : (
            <span className="nv-subnav__count">{item.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** A screen that is not built yet: what it will do, and which work brings it. Nothing else. */
export function ComingSoon({
  title,
  what,
  when,
}: {
  title: string;
  what: string;
  when: string;
}): JSX.Element {
  return (
    <Panel className="nv-coming">
      <div className="nv-coming__in">
        <p className="nv-eyebrow">{when}</p>
        <h2>{title}</h2>
        <p>{what}</p>
      </div>
    </Panel>
  );
}
