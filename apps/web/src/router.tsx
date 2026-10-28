import type { Me } from '@nirvana/contracts';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';

import { CreatorsPage } from './creators/CreatorsPage';
import { parseCreatorsSearch } from './creators/search';
import { DashboardPage } from './screens/dashboard/DashboardPage';
import { MyPlanningPage } from './screens/planning/MyPlanningPage';
import { AppearancePage } from './screens/settings/AppearancePage';
import {
  DevicesPage,
  AgentModePage,
  AiModelsPage,
  AlertsPage,
  BackupsPage,
  SettingsLayout,
  TelegramPage,
} from './screens/settings/SettingsLayout';
import { MembersPage } from './screens/team/MembersPage';
import { PlanningPage } from './screens/team/PlanningPage';
import { parseTeamSearch } from './screens/team/model';
import { TodayPage } from './screens/today/TodayPage';
import { ChatterTrackingPage } from './screens/tracking/ChatterTrackingPage';
import { SuiviNav } from './screens/tracking/SuiviNav';
import { TrackingPage } from './screens/tracking/TrackingPage';
import { AlertHistoryPage } from './screens/tracking/history/AlertHistoryPage';
import { parseTrackingSearch } from './screens/tracking/view';
import { CorrectionsPage } from './screens/train/CorrectionsPage';
import { PlaygroundPage } from './screens/train/PlaygroundPage';
import { TestsPage } from './screens/train/TestsPage';
import { TrainLayout } from './screens/train/TrainLayout';
import { parseTelegramSearch, searchOfTab, tabOfSearch } from './settings/telegram/search';
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

const dashboard = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Dashboard() {
    const { user } = rootRoute.useRouteContext();
    return <DashboardPage forCreator={user.role === 'creator'} forOwner={user.role === 'owner'} />;
  },
});
const creators = createRoute({
  getParentRoute: () => rootRoute,
  path: '/creatrices',
  validateSearch: parseCreatorsSearch,
  // Her hours are the owner's alone (P3-14): anyone else lands on the persona, not on a page the server would refuse.
  beforeLoad: ({ context, search }) => {
    if (search.onglet === 'heures' && context.user.role !== 'owner') {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects by throwing.
      throw redirect({ to: '/creatrices', search: {}, replace: true });
    }
  },
  component: function Creators() {
    const { onglet } = creators.useSearch();
    const navigate = creators.useNavigate();
    return (
      <CreatorsPage
        tab={onglet === 'heures' ? 'hours' : 'persona'}
        onTab={(tab) => void navigate({ search: tab === 'hours' ? { onglet: 'heures' } : {} })}
      />
    );
  },
});
const tracking = createRoute({
  getParentRoute: () => rootRoute,
  path: '/suivi',
  validateSearch: parseTrackingSearch,
  component: function Tracking() {
    const { conversation } = tracking.useSearch();
    const navigate = tracking.useNavigate();
    const { user } = rootRoute.useRouteContext();
    const rail = railOf(user);
    const props = {
      selected: conversation ?? null,
      onSelect: (id: string | null) => void navigate({ search: id === null ? {} : { conversation: id } }),
      canDecide: user.role !== 'creator',
      canAddCreator: canOpen(rail, '/creatrices'),
    };
    // A chatter reads Suivi within his shift (EQ-13): outside it, the page says so.
    return rail.kind === 'chatter' ? (
      <ChatterTrackingPage {...props} />
    ) : (
      <TrackingPage {...props} nav={<SuiviNav />} />
    );
  },
});
/**
 * Suivi › Historique des alertes (P4-01): whoever reads the whole creator, as the server serves it (owner, operator).
 * A creator never opens Suivi (the root sends her home); a chatter is sent to his own Suivi.
 */
const trackingAlerts = createRoute({
  getParentRoute: () => rootRoute,
  path: '/suivi/alertes',
  validateSearch: parseTrackingSearch,
  beforeLoad: ({ context }) => {
    if (railOf(context.user).kind === 'chatter') {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects by throwing.
      throw redirect({ to: '/suivi', replace: true });
    }
  },
  component: function TrackingAlerts() {
    const { conversation } = trackingAlerts.useSearch();
    const navigate = trackingAlerts.useNavigate();
    const { user } = rootRoute.useRouteContext();
    return (
      <AlertHistoryPage
        selected={conversation ?? null}
        onSelect={(id) => void navigate({ search: id === null ? {} : { conversation: id } })}
        canDecide={user.role !== 'creator'}
        isOwner={user.role === 'owner'}
        nav={<SuiviNav />}
      />
    );
  },
});

const today = createRoute({ getParentRoute: () => rootRoute, path: '/aujourdhui', component: TodayPage });
const myPlanning = createRoute({
  getParentRoute: () => rootRoute,
  path: '/planning',
  component: function MyPlanning() {
    const { user } = rootRoute.useRouteContext();
    return <MyPlanningPage userId={user.id} />;
  },
});

const team = createRoute({ getParentRoute: () => rootRoute, path: '/equipe' });
const teamIndex = createRoute({
  getParentRoute: () => team,
  path: '/',
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects by throwing.
    throw redirect({ to: '/equipe/planning', replace: true });
  },
});
const teamPlanning = createRoute({
  getParentRoute: () => team,
  path: '/planning',
  component: function TeamPlanning() {
    const { user } = rootRoute.useRouteContext();
    return <PlanningPage userId={user.id} />;
  },
});
const teamMembers = createRoute({
  getParentRoute: () => team,
  path: '/membres',
  validateSearch: parseTeamSearch,
  component: function Members() {
    const { onglet, membre } = teamMembers.useSearch();
    const navigate = teamMembers.useNavigate();
    const { user } = rootRoute.useRouteContext();
    return (
      <MembersPage
        tab={onglet === 'managers' ? 'manager' : 'chatter'}
        selected={membre ?? null}
        canManage={user.role === 'owner'}
        viewerId={user.id}
        onTab={(tab) =>
          void navigate({
            search: (before) => ({ ...before, onglet: tab === 'manager' ? 'managers' : undefined }),
          })
        }
        onSelect={(id) => void navigate({ search: (before) => ({ ...before, membre: id ?? undefined }) })}
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
  validateSearch: parseTelegramSearch,
  component: function Telegram() {
    const search = telegram.useSearch();
    const navigate = telegram.useNavigate();
    return (
      <TelegramPage
        tab={tabOfSearch(search)}
        onTab={(tab) => void navigate({ search: searchOfTab(tab), replace: true })}
      />
    );
  },
});
const alerts = createRoute({
  getParentRoute: () => settings,
  path: '/alertes',
  // The owner's alone (P4-01): anyone else is sent to Réglages, not to a page the server would refuse.
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'owner') {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects by throwing.
      throw redirect({ to: '/reglages', replace: true });
    }
  },
  component: AlertsPage,
});
const devices = createRoute({ getParentRoute: () => settings, path: '/appareils', component: DevicesPage });
const appearance = createRoute({
  getParentRoute: () => settings,
  path: '/apparence',
  component: AppearancePage,
});
const backups = createRoute({
  getParentRoute: () => settings,
  path: '/sauvegardes',
  // The owner's alone (ADR 0028): anyone else is sent to Réglages, not to a page the server would refuse.
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'owner') {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects by throwing.
      throw redirect({ to: '/reglages', replace: true });
    }
  },
  component: BackupsPage,
});
const agentMode = createRoute({ getParentRoute: () => settings, path: '/mode', component: AgentModePage });

const routeTree = rootRoute.addChildren([
  dashboard,
  creators,
  train.addChildren([trainIndex, playground, corrections, tests]),
  tracking,
  trackingAlerts,
  today,
  myPlanning,
  team.addChildren([teamIndex, teamPlanning, teamMembers]),
  settings.addChildren([settingsIndex, aiModels, telegram, alerts, backups, devices, appearance, agentMode]),
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
