import type { CurrentUser } from '@nirvana/contracts';
import { createRootRouteWithContext, createRoute, createRouter, redirect } from '@tanstack/react-router';

import { CreatorsPage } from './creators/CreatorsPage';
import { DashboardPage } from './screens/dashboard/DashboardPage';
import {
  DevicesPage,
  AgentModePage,
  AiModelsPage,
  SettingsLayout,
  TelegramPage,
} from './screens/settings/SettingsLayout';
import { TrackingPage } from './screens/tracking/TrackingPage';
import { CorrectionsPage } from './screens/train/CorrectionsPage';
import { PlaygroundPage } from './screens/train/PlaygroundPage';
import { TestsPage } from './screens/train/TestsPage';
import { TrainLayout } from './screens/train/TrainLayout';
import { AppShell } from './shell/AppShell';

/** What every screen can read: who is signed in, and how to sign out. Given by `App` once the session is known. */
export interface RouterContext {
  readonly user: CurrentUser;
  readonly onSignOut: () => void;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: function Root() {
    const { user, onSignOut } = rootRoute.useRouteContext();
    return <AppShell user={user} onSignOut={onSignOut} />;
  },
});

const dashboard = createRoute({ getParentRoute: () => rootRoute, path: '/', component: DashboardPage });
const creators = createRoute({
  getParentRoute: () => rootRoute,
  path: '/creatrices',
  component: CreatorsPage,
});
const tracking = createRoute({ getParentRoute: () => rootRoute, path: '/suivi', component: TrackingPage });

const train = createRoute({ getParentRoute: () => rootRoute, path: '/entrainer', component: TrainLayout });
const trainIndex = createRoute({
  getParentRoute: () => train,
  path: '/',
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects by throwing.
    throw redirect({ to: '/entrainer/playground', replace: true });
  },
});
const playground = createRoute({
  getParentRoute: () => train,
  path: '/playground',
  component: PlaygroundPage,
});
const corrections = createRoute({
  getParentRoute: () => train,
  path: '/corrections',
  component: CorrectionsPage,
});
const tests = createRoute({ getParentRoute: () => train, path: '/tests', component: TestsPage });

const settings = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reglages',
  component: SettingsLayout,
});
const settingsIndex = createRoute({
  getParentRoute: () => settings,
  path: '/',
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects by throwing.
    throw redirect({ to: '/reglages/modeles-ia', replace: true });
  },
});
const aiModels = createRoute({
  getParentRoute: () => settings,
  path: '/modeles-ia',
  component: AiModelsPage,
});
const telegram = createRoute({
  getParentRoute: () => settings,
  path: '/telegram',
  component: TelegramPage,
});
const devices = createRoute({ getParentRoute: () => settings, path: '/appareils', component: DevicesPage });
const agentMode = createRoute({ getParentRoute: () => settings, path: '/mode', component: AgentModePage });

const routeTree = rootRoute.addChildren([
  dashboard,
  creators,
  train.addChildren([trainIndex, playground, corrections, tests]),
  tracking,
  settings.addChildren([settingsIndex, aiModels, telegram, devices, agentMode]),
]);

const buildRouter = (context: RouterContext) =>
  createRouter({ routeTree, context, defaultPreload: 'intent' });

export type AppRouter = ReturnType<typeof buildRouter>;

export function createAppRouter(context: RouterContext): AppRouter {
  return buildRouter(context);
}

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
