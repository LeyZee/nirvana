import type { Me } from '@nirvana/contracts';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';

import { CreatorsPage } from './creators/CreatorsPage';
import { DashboardPage } from './screens/dashboard/DashboardPage';
import { AppearancePage } from './screens/settings/AppearancePage';
import {
  DevicesPage,
  AgentModePage,
  AiModelsPage,
  SettingsLayout,
  TelegramPage,
} from './screens/settings/SettingsLayout';
import { TrackingPage } from './screens/tracking/TrackingPage';
import { parseTrackingSearch } from './screens/tracking/view';
import { CorrectionsPage } from './screens/train/CorrectionsPage';
import { PlaygroundPage } from './screens/train/PlaygroundPage';
import { TestsPage } from './screens/train/TestsPage';
import { TrainLayout } from './screens/train/TrainLayout';
import { AppShell } from './shell/AppShell';
import { canOpen, railOf, sectionOf } from './shell/nav';

/** What every screen can read: who is signed in, and how to sign out. Given by `App` once the session is known. */
export interface RouterContext {
  readonly user: Me;
  readonly onSignOut: () => void;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  // A section outside the account's rail sends it to its first tab (ADR 0024); the server's 403 stays the barrier.
  beforeLoad: ({ context, location }) => {
    const rail = railOf(context.user);
    const section = sectionOf(location.pathname);
    if (section !== null && !canOpen(rail, section)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects by throwing.
      throw redirect({ to: rail.home, replace: true });
    }
  },
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
const tracking = createRoute({
  getParentRoute: () => rootRoute,
  path: '/suivi',
  validateSearch: parseTrackingSearch,
  component: function Tracking() {
    const { conversation } = tracking.useSearch();
    const navigate = tracking.useNavigate();
    const { user } = rootRoute.useRouteContext();
    return (
      <TrackingPage
        selected={conversation ?? null}
        onSelect={(id) => void navigate({ search: id === null ? {} : { conversation: id } })}
        canDecide={user.role !== 'creator'}
        canAddCreator={canOpen(railOf(user), '/creatrices')}
      />
    );
  },
});

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
const appearance = createRoute({
  getParentRoute: () => settings,
  path: '/apparence',
  component: AppearancePage,
});
const agentMode = createRoute({ getParentRoute: () => settings, path: '/mode', component: AgentModePage });

const routeTree = rootRoute.addChildren([
  dashboard,
  creators,
  train.addChildren([trainIndex, playground, corrections, tests]),
  tracking,
  settings.addChildren([settingsIndex, aiModels, telegram, devices, appearance, agentMode]),
]);

const buildRouter = (context: RouterContext, history?: RouterHistory) =>
  createRouter({
    routeTree,
    context,
    defaultPreload: 'intent',
    ...(history === undefined ? {} : { history }),
  });

export type AppRouter = ReturnType<typeof buildRouter>;

/** `history` is for tests, which start on an address of their choosing. */
export function createAppRouter(context: RouterContext, history?: RouterHistory): AppRouter {
  return buildRouter(context, history);
}

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
