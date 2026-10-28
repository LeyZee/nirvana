import { Outlet, useRouteContext } from '@tanstack/react-router';
import type { JSX } from 'react';

import { AlertsSection } from '@/settings/alerts/AlertsSection';
import { BackupsSection } from '@/settings/backups/BackupsSection';
import { ServicesSection } from '@/settings/services/ServicesSection';
import { TelegramSection } from '@/settings/telegram/TelegramSection';
import type { TelegramTab } from '@/settings/telegram/search';
import { ComingSoon, Page, PageHeader, SubNav, type SubNavItem } from '@/shell/layout';

/** The alerts and the backups are the owner's alone (P4-01, ADR 0028): anyone else gets no tab that would answer 403. */
const ALERTS_TAB: SubNavItem = { to: '/reglages/alertes', label: 'Alertes' };
const BACKUPS_TAB: SubNavItem = { to: '/reglages/sauvegardes', label: 'Sauvegardes' };

export function SettingsLayout(): JSX.Element {
  const { user, onSignOut } = useRouteContext({ from: '__root__' });
  return (
    <Page>
      <PageHeader
        title="Réglages"
        actions={
          <>
            <SubNav
              label="Réglages"
              items={[
                { to: '/reglages/modeles-ia', label: 'Modèles IA' },
                ...(user.role === 'owner' ? [ALERTS_TAB] : []),
                { to: '/reglages/telegram', label: 'Telegram' },
                ...(user.role === 'owner' ? [BACKUPS_TAB] : []),
                { to: '/reglages/appareils', label: 'Appareils' },
                { to: '/reglages/apparence', label: 'Apparence' },
                { to: '/reglages/mode', label: 'Mode de l’agent' },
              ]}
            />
            <button type="button" className="nv-btn nv-btn--plain nv-btn--sm md:hidden" onClick={onSignOut}>
              Se déconnecter
            </button>
          </>
        }
      />
      <Outlet />
    </Page>
  );
}

/** Réglages › Modèles IA: the Services page of P3-03, as the Connecteurs thread built it. */
export function AiModelsPage(): JSX.Element {
  return <ServicesSection />;
}

/** Réglages › Alertes: her own alerts and the system's, on each creator (P4-01). */
export function AlertsPage(): JSX.Element {
  return <AlertsSection />;
}

/** Réglages › Telegram: bots, groups and who gets which alert (fiche P3-07), the tab in the address. */
export function TelegramPage({
  tab,
  onTab,
}: {
  tab: TelegramTab;
  onTab: (tab: TelegramTab) => void;
}): JSX.Element {
  return <TelegramSection tab={tab} onTab={onTab} />;
}

/** Réglages › Sauvegardes: the nightly export and the restore test (EQ-17, ADR 0028). */
export function BackupsPage(): JSX.Element {
  return <BackupsSection />;
}

export function DevicesPage(): JSX.Element {
  return (
    <ComingSoon
      title="Les extensions reliées"
      what="Chaque navigateur où l’extension tourne, sa session Reveal et le moyen de le délier."
      when="Avec l’extension"
    />
  );
}

export function AgentModePage(): JSX.Element {
  return (
    <ComingSoon
      title="Copilote ou automatique"
      what="Le mode se change en haut du Dashboard. L’automatique s’ouvre quand le serveur valide le taux en réel et le test à l’aveugle ; le Dashboard dit ce qui manque, chiffres à l’appui."
      when="Après le copilote"
    />
  );
}
