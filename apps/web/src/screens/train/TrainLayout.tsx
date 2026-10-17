import { Outlet } from '@tanstack/react-router';
import type { JSX } from 'react';

import { Page, PageHeader, SubNav } from '@/shell/layout';

export function TrainLayout(): JSX.Element {
  return (
    <Page>
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
