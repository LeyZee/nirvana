import { Outlet, useRouteContext } from '@tanstack/react-router';
import type { JSX } from 'react';

import { AlertsSection } from '@/settings/alerts/AlertsSection';
import { BackupsSection } from '@/settings/backups/BackupsSection';
import { PayRulesSection } from '@/settings/pay/PayRulesSection';
import { ServicesSection } from '@/settings/services/ServicesSection';
import { TelegramSection } from '@/settings/telegram/TelegramSection';
import type { TelegramTab } from '@/settings/telegram/search';
import { ComingSoon, Page, PageHeader, SubNav, type SubNavItem } from '@/shell/layout';

import './settings.css';

/**
 * The owner's tabs alone, as the server serves these pages to her alone: anyone else gets no tab that would
 * answer 403. The AI keys and the bots and groups (P3-03, P3-07), the alerts (P4-01), the accounts' pay rules
 * (EQ-03) and the backups (ADR 0028).
 */
const OWNER_TABS: readonly SubNavItem[] = [
  { to: '/reglages/modeles-ia', label: 'Modèles IA' },
  { to: '/reglages/alertes', label: 'Alertes' },
  { to: '/reglages/telegram', label: 'Telegram' },
  { to: '/reglages/regles-de-paie', label: 'Règles de paie' },
  { to: '/reglages/sauvegardes', label: 'Sauvegardes' },
];

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
                ...(user.role === 'owner' ? OWNER_TABS : []),
                { to: '/reglages/appareils', label: 'Appareils' },
                { to: '/reglages/apparence', label: 'Apparence' },
                { to: '/reglages/mode', label: 'Mode de l’agent' },
              ]}
            />
            <button type="button" className="nv-btn nv-btn--plain nv-btn--sm st-signout" onClick={onSignOut}>
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

/** Réglages › Règles de paie: each account's currency, VAT, platform commission and source of sales (EQ-03). */
export function PayRulesPage(): JSX.Element {
  return <PayRulesSection />;
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
