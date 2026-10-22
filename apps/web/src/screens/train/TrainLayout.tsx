import { Outlet, useRouterState } from '@tanstack/react-router';
import type { JSX } from 'react';

import { Page, PageHeader, SubNav } from '@/shell/layout';

export function TrainLayout(): JSX.Element {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // The Playground scrolls its thread inside and keeps the composer in view: its page fills the stage.
  return (
    <Page className={pathname.startsWith('/entrainer/playground') ? 'nv-page--fill' : undefined}>
      <PageHeader
        title="Entraîner"
        actions={
          <SubNav
            label="Entraîner"
            items={[
              { to: '/entrainer/playground', label: 'Playground' },
              { to: '/entrainer/corrections', label: 'Corrections' },
              { to: '/entrainer/tests', label: 'Tests' },
            ]}
          />
        }
      />
      <Outlet />
    </Page>
  );
}
